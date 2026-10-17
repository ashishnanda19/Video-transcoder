#!/usr/bin/env node
// Replays what the browser does (video-transcoder-client upload + assets pages) against a running local server,
// including the CORS checks a browser would make from http://localhost:3000. Use it to catch problems before clicking.
//
//   node scripts/replay-frontend-flow.js [--server http://localhost:8000/api/v1] [--origin http://localhost:3000] [--input clip.mp4] [--file-name same.mp4] [--timeout-min 15]
//   (--file-name re-uploads under a fixed name, to test two uploads of the same file)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const SERVER = arg("--server", "http://localhost:8000/api/v1");
const ORIGIN = arg("--origin", "http://localhost:3000");
const TIMEOUT_MIN = Number(arg("--timeout-min", 15));
const t0 = Date.now();
const log = (m) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, m, extra = "") => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}${extra ? " - " + extra : ""}`); if (!c) failed++; return c; };

async function api(p, opts = {}) {
  const res = await fetch(`${SERVER}${p}`, { ...opts, headers: { Origin: ORIGIN, ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

(async () => {
  console.log(`Frontend flow replay -> ${SERVER} (as origin ${ORIGIN})\n`);

  // the layout calls this first
  const me = await api("/user/current-user");
  ok(me.res.ok && me.body.data, "current-user", me.body.data ? me.body.data.displayName : `HTTP ${me.res.status}`);
  ok(me.res.headers.get("access-control-allow-origin") === ORIGIN, "server CORS allows the frontend origin");

  // input clip (the UI caps uploads at 30 MB and mp4/webm/ogg)
  let input = arg("--input");
  if (!input) {
    input = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fe-")), "clip.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input]);
  }
  const fileName = arg("--file-name", `fe-test-${Date.now()}.mp4`);
  const base = fileName.split(".")[0];
  const size = fs.statSync(input).size;

  // upload page: GET signed URL, then PUT to it
  const u = await api(`/video/get-upload-url?fileName=${fileName}&contentType=video/mp4`);
  if (!ok(u.res.ok && typeof u.body.data === "string", "get-upload-url returns a presigned URL", u.res.ok ? "" : `HTTP ${u.res.status}`)) process.exit(1);
  const putUrl = u.body.data;

  const pre = await fetch(putUrl, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  ok(pre.status === 200 && pre.headers.get("access-control-allow-origin") === ORIGIN, "S3 CORS preflight for the browser PUT", `HTTP ${pre.status}`);

  const put = await fetch(putUrl, { method: "PUT", body: fs.readFileSync(input), headers: { "Content-Type": "video/mp4", Origin: ORIGIN } });
  if (!ok(put.ok, "PUT to S3 with the presigned URL", `${(size / 1048576).toFixed(1)} MB, HTTP ${put.status}`)) process.exit(1);
  log(`uploaded ${fileName}; waiting for S3 -> Lambda -> server -> ECS`);

  // assets page: poll /video/v/:fileName then /video/s/:id
  const uploadedAt = Date.now() - 5000;
  let video = null;
  const deadline = Date.now() + TIMEOUT_MIN * 60000;
  let last = "";
  while (Date.now() < deadline) {
    if (!video) {
      const v = await api(`/video/v/${base}`);
      if (v.res.ok && new Date(v.body.data.createdAt).getTime() >= uploadedAt) { video = v.body.data; log(`server created the video record (Lambda reached the server): ${video._id}`); }
    }
    if (video) {
      const s = await api(`/video/s/${video._id}`);
      const state = s.body.data && s.body.data.progress;
      if (state && state !== last) { last = state; log(`status: ${state}`); }
      if (state === "completed" || state === "failed") break;
    }
    await sleep(4000);
  }
  ok(!!video, "the Lambda forwarded the S3 event to the local server");
  ok(last === "completed", "job reached 'completed' (container webhook reached the server)", `final status: ${last || "none"}`);
  if (last !== "completed") process.exit(1);

  // download buttons: signed GET per rung
  const fresh = (await api(`/video/v/${base}`)).body.data;
  const rungs = Object.entries(fresh.videoResolutions || {});
  ok(rungs.length === 4, "record lists all 4 resolutions", rungs.map(([k]) => k).join(","));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fe-out-"));
  for (const [rung, file] of rungs) {
    const g = await api(`/video/get-video-urls?fileName=${base}&videoUrl=${file}`);
    const r = await fetch(g.body.data, { headers: { Origin: ORIGIN } });
    const buf = Buffer.from(await r.arrayBuffer());
    const p = path.join(dir, file);
    fs.writeFileSync(p, buf);
    let info = "";
    try { info = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", p]).toString().trim(); } catch (_) {}
    ok(r.ok && buf.length > 1000 && r.headers.get("access-control-allow-origin") === ORIGIN, `download ${rung}`, `${info} ${(buf.length / 1048576).toFixed(2)} MB`);
  }

  // temp upload should have been deleted by the completion webhook
  log(failed ? "FAILED" : "all checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
