const test = require("node:test");
const assert = require("node:assert/strict");
const { isEmailAllowed, readAllowlist, isAllowlistConfigured } = require("../src/auth/allowlist.js");
const { signJob, verifySharedSecret, verifyJobToken } = require("../src/utils/webhookAuth.js");
const { sanitizeFileName, titleFromFileName, buildUploadKey, validateUploadRequest, MAX_UPLOAD_BYTES } = require("../src/utils/uploadKey.js");
const { loadConfig } = require("../src/config.js");

// ---- allowlist
test("allowlist: exact emails are case-insensitive; everyone else is refused", () => {
  const list = readAllowlist({ ALLOWED_EMAILS: "Me@Example.com, friend@gmail.com" });
  assert.equal(isEmailAllowed("me@example.com", list), true);
  assert.equal(isEmailAllowed("FRIEND@gmail.com", list), true);
  assert.equal(isEmailAllowed("stranger@gmail.com", list), false);
});

test("allowlist: a domain rule matches that domain only (not look-alikes or sub-strings)", () => {
  const list = readAllowlist({ ALLOWED_EMAIL_DOMAINS: "@corp.com" });
  assert.equal(isEmailAllowed("a@corp.com", list), true);
  assert.equal(isEmailAllowed("a@evilcorp.com", list), false);
  assert.equal(isEmailAllowed("a@corp.com.evil.io", list), false);
  assert.equal(isEmailAllowed("corp.com", list), false);
});

test("allowlist fails closed: empty config admits nobody, ALLOW_ANYONE must be explicit", () => {
  assert.equal(isEmailAllowed("a@b.com", readAllowlist({})), false);
  assert.equal(isAllowlistConfigured(readAllowlist({})), false);
  assert.equal(isEmailAllowed("a@b.com", readAllowlist({ ALLOW_ANYONE: "true" })), true);
  assert.equal(isEmailAllowed(undefined, readAllowlist({ ALLOWED_EMAILS: "a@b.com" })), false);
  assert.equal(isEmailAllowed("", readAllowlist({ ALLOW_ANYONE: "false" })), false);
});

// ---- webhook auth
test("shared secret: exact match only, empty secret never authenticates", () => {
  assert.equal(verifySharedSecret("s3cret", "s3cret"), true);
  assert.equal(verifySharedSecret("s3cre", "s3cret"), false);
  assert.equal(verifySharedSecret(undefined, "s3cret"), false);
  assert.equal(verifySharedSecret("", ""), false);
});

test("job token: bound to one job id and one secret", () => {
  const t = signJob("job-1", "secret");
  assert.equal(verifyJobToken("job-1", t, "secret"), true);
  assert.equal(verifyJobToken("job-2", t, "secret"), false, "a token from another job must not work");
  assert.equal(verifyJobToken("job-1", t, "other-secret"), false);
  assert.equal(verifyJobToken("job-1", undefined, "secret"), false);
  assert.equal(verifyJobToken(undefined, t, "secret"), false);
  assert.equal(verifyJobToken("job-1", t, ""), false);
});

// ---- upload keys
test("file names are sanitised: no path traversal, no URL-breaking characters", () => {
  assert.equal(sanitizeFileName("../../etc/passwd.mp4"), "passwd.mp4");
  assert.equal(sanitizeFileName("C:\\evil\\clip.mp4"), "clip.mp4");
  assert.equal(sanitizeFileName("a&b#c?d%e+f.mp4"), "a_b_c_d_e_f.mp4");
  assert.equal(sanitizeFileName("  .hidden.mp4 "), "hidden.mp4");
  assert.equal(sanitizeFileName(""), "video");
  assert.equal(sanitizeFileName(undefined), "video");
  assert.equal(sanitizeFileName("ünï cödé 🎬.mp4"), "ünï cödé 🎬.mp4");
  const long = sanitizeFileName("x".repeat(500) + ".mp4");
  assert.ok(long.length <= 108 && long.endsWith(".mp4"));
});

test("keys are unique per upload and titles drop only the last extension", () => {
  assert.equal(buildUploadKey({ videoId: "abc", fileName: "My Clip.mp4" }), "uploads/videos/abc/My Clip.mp4");
  assert.notEqual(buildUploadKey({ videoId: "a", fileName: "x.mp4" }), buildUploadKey({ videoId: "b", fileName: "x.mp4" }));
  assert.equal(titleFromFileName("My.Holiday.Clip.mp4"), "My.Holiday.Clip");
  assert.equal(titleFromFileName("noext"), "noext");
});

test("upload requests are validated server-side (type, size, name)", () => {
  const ok = { fileName: "a.mp4", contentType: "video/mp4", size: 1000 };
  assert.equal(validateUploadRequest(ok), null);
  assert.match(validateUploadRequest({ ...ok, contentType: "application/zip" }), /Unsupported/);
  assert.match(validateUploadRequest({ ...ok, size: MAX_UPLOAD_BYTES + 1 }), /too large/);
  assert.match(validateUploadRequest({ ...ok, size: 0 }), /size/);
  assert.match(validateUploadRequest({ ...ok, size: "12abc" }), /size/);
  assert.match(validateUploadRequest({ ...ok, fileName: "" }), /fileName/);
  assert.equal(validateUploadRequest({ ...ok, size: "1000" }), null, "numeric strings from JSON are accepted");
});

// ---- production config
const prodEnv = {
  NODE_ENV: "production", MONGO_URI: "m", REDIS_URL: "r", SESSION_SECRET: "s".repeat(32), GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "sec", PUBLIC_URL: "https://x.example.net/", WEBHOOK_SECRET: "w".repeat(32),
  TEMP_S3_BUCKET_NAME: "t", FINAL_S3_BUCKET_NAME: "f", ALLOWED_EMAILS: "a@b.com",
};

test("a complete production config is accepted and derives the OAuth callback", () => {
  const c = loadConfig(prodEnv);
  assert.deepEqual(c.problems, []);
  assert.equal(c.googleCallbackUrl, "https://x.example.net/api/v1/user/google/callback");
  assert.equal(c.authDisabled, false);
});

test("production refuses to start half-configured", () => {
  const missing = loadConfig({ NODE_ENV: "production" }).problems.join(" | ");
  for (const k of ["MONGO_URI", "SESSION_SECRET", "WEBHOOK_SECRET", "ALLOWED_EMAILS"]) assert.match(missing, new RegExp(k));
  assert.match(loadConfig({ ...prodEnv, SESSION_SECRET: "short" }).problems.join(), /SESSION_SECRET.*32/);
  assert.match(loadConfig({ ...prodEnv, PUBLIC_URL: "http://x.com" }).problems.join(), /https/);
  assert.match(loadConfig({ ...prodEnv, ALLOWED_EMAILS: "" }).problems.join(), /ALLOWED_EMAILS/);
  assert.match(loadConfig({ ...prodEnv, AUTH_DISABLED: "true" }).problems.join(), /AUTH_DISABLED/);
});

test("AUTH_DISABLED only ever takes effect outside production", () => {
  assert.equal(loadConfig({ AUTH_DISABLED: "true" }).authDisabled, true);
  assert.equal(loadConfig({ ...prodEnv, AUTH_DISABLED: "true" }).authDisabled, false);
});
