#!/usr/bin/env node
// Post-deploy smoke test of the PUBLIC site: is it up, is the UI served, and is every door locked that should be?
// It sends no credentials and changes nothing (the only writes it attempts are ones that must be refused).
//
//   node scripts/check-live.js [--url https://<id>.execute-api.<region>.amazonaws.com]
// The URL defaults to `terraform output site_url` in infra/.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
let BASE = arg("--url", "");
if (!BASE) {
  try { BASE = execFileSync("terraform", ["-chdir=" + path.join(__dirname, "..", "infra"), "output", "-raw", "site_url"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { console.error("Pass --url, or run from a checkout where `terraform output site_url` works."); process.exit(2); }
}
BASE = BASE.replace(/\/+$/, "");

let failed = 0;
const ok = (c, m, extra = "") => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}${extra ? " - " + extra : ""}`); if (!c) failed++; return c; };
const get = (p, opts = {}) => fetch(BASE + p, { redirect: "manual", ...opts });
const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  console.log(`Checking ${BASE}\n`);

  console.log("Availability");
  const health = await get("/api/v1/health").catch(() => null);
  if (!ok(health && health.status === 200, "API is healthy (/api/v1/health)", health ? `HTTP ${health.status}` : "no response")) {
    console.log("\n  The API is not answering. Is the service running?  aws ecs describe-services --cluster vidflow-api --services vidflow-api");
    process.exit(1);
  }

  console.log("\nUI");
  const home = await get("/");
  const html = await home.text();
  ok(home.status === 200 && /VidFlow/.test(html), "landing page is served", `HTTP ${home.status}`);
  ok(/no-cache/.test(home.headers.get("cache-control") || ""), "pages are revalidated, not stuck in caches", home.headers.get("cache-control") || "none");
  const asset = (html.match(/\/_next\/static\/[^"']+\.js/) || [])[0];
  if (asset) {
    const a = await get(asset);
    ok(a.status === 200 && /immutable/.test(a.headers.get("cache-control") || ""), "hashed assets are cached for a year", a.headers.get("cache-control") || "none");
  }
  const miss = await get("/definitely-not-a-page", { headers: { Accept: "text/html" } });
  ok(miss.status === 404, "unknown pages return a real 404", `HTTP ${miss.status}`);

  console.log("\nSecurity headers");
  const h = home.headers;
  ok(/max-age=\d+/.test(h.get("strict-transport-security") || ""), "HSTS (browsers stay on https)");
  ok(h.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  ok(/frame-ancestors 'none'/.test(h.get("content-security-policy") || ""), "CSP forbids framing (clickjacking)");
  ok(!/unsafe-eval/.test(h.get("content-security-policy") || ""), "CSP does not allow eval");
  ok(!h.get("x-powered-by"), "server does not advertise its framework");

  console.log("\nEverything private requires a login (no cookie sent)");
  const guarded = [
    ["GET", "/api/v1/user/current-user"],
    ["GET", "/api/v1/video/get-all-videos"],
    ["GET", "/api/v1/video/id/665f1c0e8f1b2c3d4e5f6a7b"],
    ["GET", "/api/v1/video/id/665f1c0e8f1b2c3d4e5f6a7b/rendition/720p"],
    ["POST", "/api/v1/video/uploads", { fileName: "a.mp4", contentType: "video/mp4", size: 10 }],
    ["POST", "/api/v1/user/logout"],
  ];
  for (const [method, p, body] of guarded) {
    const r = await get(p, method === "POST" ? json(body || {}) : {});
    ok(r.status === 401, `${method} ${p.replace(/[a-f0-9]{24}/, ":id")}`, `HTTP ${r.status}`);
  }
  const forged = await get("/api/v1/video/get-all-videos", { headers: { Cookie: "vidflow.sid=s%3Aforged.cookie; connect.sid=anything" } });
  ok(forged.status === 401, "forged session cookies are rejected", `HTTP ${forged.status}`);

  console.log("\nServer-to-server endpoints refuse strangers");
  const s3 = await get("/api/v1/video/s3-trigger", json({ s3EventData: { object: { key: "uploads/videos/x/y.mp4" } } }));
  ok(s3.status === 401, "S3 trigger without the shared secret", `HTTP ${s3.status}`);
  const wrongSecret = await get("/api/v1/video/s3-trigger", { ...json({ s3EventData: { object: { key: "k" } } }), headers: { "Content-Type": "application/json", "X-Webhook-Secret": "guess" } });
  ok(wrongSecret.status === 401, "S3 trigger with a wrong secret", `HTTP ${wrongSecret.status}`);
  const job = await get("/api/v1/video/ecs-trigger", json({ jobId: "665f1c0e8f1b2c3d4e5f6a7b", progress: "completed", videoResolutions: {} }));
  ok(job.status === 401, "job webhook without a job token", `HTTP ${job.status}`);

  console.log("\nGoogle sign-in");
  const start = await get("/api/v1/user/google");
  const loc = start.headers.get("location") || "";
  ok(start.status === 302 && /^https:\/\/accounts\.google\.com\//.test(loc), "starts a Google OAuth flow", `HTTP ${start.status}`);
  if (loc) {
    const q = new URL(loc).searchParams;
    ok(q.get("redirect_uri") === `${BASE}/api/v1/user/google/callback`, "redirect_uri is this site's callback (must be registered in Google Cloud)", q.get("redirect_uri") || "");
    ok(q.get("response_type") === "code", "authorization-code flow");
    ok(Boolean(q.get("state")), "anti-CSRF state parameter present");
    ok(/openid|profile/.test(q.get("scope") || "") && !/drive|gmail|calendar/.test(q.get("scope") || ""), "asks only for profile + email", q.get("scope") || "");
    ok(/\.apps\.googleusercontent\.com$/.test(q.get("client_id") || "") && !/dummy|test|example/i.test(q.get("client_id") || ""), "uses a real Google client id");
  }
  const cookie = (start.headers.getSetCookie ? start.headers.getSetCookie() : []).find((c) => c.startsWith("vidflow.sid"));
  ok(Boolean(cookie), "a session cookie is issued for the OAuth state");
  if (cookie) {
    ok(/HttpOnly/i.test(cookie), "session cookie is HttpOnly (page scripts cannot read it)");
    ok(/Secure/i.test(cookie), "session cookie is Secure (https only)");
    ok(/SameSite=Lax/i.test(cookie), "session cookie is SameSite=Lax (blocks cross-site POSTs)");
  }
  const bad = await get("/api/v1/user/google/callback?code=forged&state=forged");
  const badLoc = bad.headers.get("location") || "";
  ok(bad.status === 302 && /\/signin\/?\?error=/.test(badLoc) || /accounts\.google\.com/.test(badLoc), "a forged OAuth callback does not log anyone in", `HTTP ${bad.status} -> ${badLoc.slice(0, 60)}`);

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
