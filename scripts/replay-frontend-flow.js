#!/usr/bin/env node
// Replays what the browser does against a running server and the real AWS stack, then attacks it a little.
//
//   node scripts/replay-frontend-flow.js [--server http://localhost:8000/api/v1] [--origin http://localhost:3000]
//        [--input clip.mp4] [--file-name name.mp4] [--lambda-secret <WEBHOOK_SECRET>] [--timeout-min 15]
//
// --lambda-secret   also delivers the S3 event to the server itself, with that secret (what the Lambda does), for
//                   setups where the real Lambda cannot reach the server.
// The server must have AUTH_DISABLED=true (the script acts as the local dev user) unless you pass --cookie "vidflow.sid=...".
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const SERVER = arg("--server", "http://localhost:8000/api/v1");
const ORIGIN = arg("--origin", "http://localhost:3000");
const COOKIE = arg("--cookie", "");
const LAMBDA_SECRET = arg("--lambda-secret", "");
const TIMEOUT_MIN = Number(arg("--timeout-min", 15));
const t0 = Date.now();
const log = (m) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, m, extra = "") => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}${extra ? " - " + extra : ""}`); if (!c) failed++; return c; };

async function api(p, opts = {}) {
  const res = await fetch(`${SERVER}${p}`, {
    ...opts,
    headers: { Origin: ORIGIN, ...(COOKIE ? { Cookie: COOKIE } : {}), ...(opts.json ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) },
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

(async () => {
  console.log(`Frontend flow replay -> ${SERVER}\n`);

  const me = await api("/user/current-user");
  ok(me.res.ok && me.body.data && me.body.data.email, "current-user", me.body.data ? me.body.data.displayName : `HTTP ${me.res.status}`);
  ok(me.body.data && !("googleId" in me.body.data) && !("_id" in me.body.data), "current-user exposes no internal ids");

  let input = arg("--input");
  if (!input) {
    input = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fe-")), "clip.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input]);
  }
  const fileName = arg("--file-name", `fe test ${Date.now()}.mp4`);
  const bytes = fs.readFileSync(input);

  console.log("\nSecurity checks");
  const anon = await fetch(`${SERVER}/video/get-all-videos`, { headers: { Cookie: "vidflow.sid=s%3Aforged.cookie" } });
  if (!COOKIE && process.env.EXPECT_AUTH !== "off") ok(anon.status === 401 || anon.ok, "a forged session cookie is not accepted as a login (401 unless auth is bypassed locally)", `HTTP ${anon.status}`);
  const noSecret = await fetch(`${SERVER}/video/s3-trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ s3EventData: { object: { key: "uploads/videos/x/y.mp4" } } }) });
  ok(LAMBDA_SECRET ? noSecret.status === 401 : noSecret.status !== 500, "S3 trigger refuses callers without the shared secret", `HTTP ${noSecret.status}`);
  const noToken = await fetch(`${SERVER}/video/ecs-trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: "665f1c0e8f1b2c3d4e5f6a7b", progress: "completed", videoResolutions: {} }) });
  ok(LAMBDA_SECRET ? noToken.status === 401 : noToken.status !== 500, "job webhook refuses callers without a job token", `HTTP ${noToken.status}`);
  const bad = await api("/video/uploads", { method: "POST", json: { fileName: "a.exe", contentType: "application/x-msdownload", size: 10 } });
  ok(bad.res.status === 400, "upload of a non-video type is rejected by the server", `HTTP ${bad.res.status}`);
  const huge = await api("/video/uploads", { method: "POST", json: { fileName: "big.mp4", contentType: "video/mp4", size: 5 * 1024 ** 3 } });
  ok(huge.res.status === 400, "an oversized upload is rejected before any URL is issued", `HTTP ${huge.res.status}`);

  console.log("\nUpload");
  const created = await api("/video/uploads", { method: "POST", json: { fileName, contentType: "video/mp4", size: bytes.length } });
  if (!ok(created.res.status === 201 && created.body.data && created.body.data.uploadUrl, "POST /video/uploads returns a record id and a signed URL", `HTTP ${created.res.status} ${created.body.message || ""}`)) process.exit(1);
  const { videoId, uploadUrl } = created.body.data;

  const pre = await fetch(uploadUrl, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  ok(pre.status === 200 && pre.headers.get("access-control-allow-origin") === ORIGIN, "S3 CORS preflight for the browser PUT", `HTTP ${pre.status}`);

  const tooBig = await fetch(uploadUrl, { method: "PUT", body: Buffer.concat([bytes, Buffer.alloc(1024, 1)]), headers: { "Content-Type": "video/mp4", Origin: ORIGIN } });
  ok(tooBig.status === 403, "S3 rejects a body bigger than the size the server approved", `HTTP ${tooBig.status}`);

  const put = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "video/mp4", Origin: ORIGIN } });
  if (!ok(put.ok, "PUT to S3 with the presigned URL", `${(bytes.length / 1048576).toFixed(1)} MB, HTTP ${put.status}`)) process.exit(1);
  log(`uploaded ${fileName} (record ${videoId})`);

  if (LAMBDA_SECRET) {
    const rec = (await api(`/video/id/${videoId}`)).body.data;
    // S3 events URL-encode keys ('+' for spaces); deliver exactly that.
    const evt = { s3EventData: { object: { key: rec.objectKey.replace(/[^A-Za-z0-9\-_.~/]/g, (c) => (c === " " ? "+" : encodeURIComponent(c))) } } };
    const d = await fetch(`${SERVER}/video/s3-trigger`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": LAMBDA_SECRET }, body: JSON.stringify(evt) });
    ok(d.ok, "S3 trigger accepts the shared secret", `HTTP ${d.status}`);
    const again = await fetch(`${SERVER}/video/s3-trigger`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": LAMBDA_SECRET }, body: JSON.stringify(evt) });
    ok(again.ok, "a duplicate S3 event is acknowledged (and ignored)", `HTTP ${again.status}`);
  }

  console.log("\nPipeline");
  let last = "";
  const deadline = Date.now() + TIMEOUT_MIN * 60000;
  let video;
  while (Date.now() < deadline) {
    video = (await api(`/video/id/${videoId}`)).body.data;
    if (video && video.progress !== last) { last = video.progress; log(`status: ${last}`); }
    if (last === "completed" || last === "failed") break;
    await sleep(3000);
  }
  ok(last === "completed", "job reached 'completed' (container webhook accepted)", `final status: ${last || "none"}`);
  if (last !== "completed") process.exit(1);

  const rungs = Object.keys(video.videoResolutions || {});
  ok(rungs.length === 4, "record lists all 4 resolutions", rungs.join(","));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-out-"));
  for (const rung of ["1080p", "720p", "480p", "360p"]) {
    const g = await api(`/video/id/${videoId}/rendition/${rung}`);
    const r = await fetch(g.body.data, { headers: { Origin: ORIGIN } });
    const buf = Buffer.from(await r.arrayBuffer());
    const p = path.join(dir, `${rung}.mp4`);
    fs.writeFileSync(p, buf);
    let info = "";
    try { info = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", p]).toString().trim(); } catch (_) {}
    ok(r.ok && buf.length > 1000, `stream ${rung}`, `${info} ${(buf.length / 1048576).toFixed(2)} MB`);
  }
  const dl = await api(`/video/id/${videoId}/rendition/360p?download=1`);
  // (a presigned GET URL is signed for GET, so probe it with a 1-byte ranged GET rather than HEAD)
  const dlRes = await fetch(dl.body.data, { headers: { Range: "bytes=0-0" } });
  ok(/attachment/.test(dlRes.headers.get("content-disposition") || ""), "download links force a save-as", dlRes.headers.get("content-disposition") || "");

  const other = await api(`/video/id/000000000000000000000000`);
  ok(other.res.status === 404, "someone else's / unknown video id looks like 'not found'", `HTTP ${other.res.status}`);
  const bogusRung = await api(`/video/id/${videoId}/rendition/4k`);
  ok(bogusRung.res.status === 400, "unknown rendition names are rejected", `HTTP ${bogusRung.res.status}`);

  log(failed ? `${failed} CHECK(S) FAILED` : "all checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
