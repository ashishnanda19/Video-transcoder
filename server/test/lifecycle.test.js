const test = require("node:test");
const assert = require("node:assert/strict");
const { isDeletable, retentionCutoff, outputPrefixOf } = require("../src/utils/videoLifecycle.js");
const { loadConfig } = require("../src/config.js");

test("only videos that are not in flight can be deleted", () => {
  for (const s of ["queued", "starting", "processing"]) assert.equal(isDeletable(s), false, s);
  for (const s of ["pending", "completed", "failed"]) assert.equal(isDeletable(s), true, s);
});

test("retention cutoff is N days back, and 0 disables it", () => {
  const now = Date.UTC(2026, 9, 31, 12);
  assert.equal(retentionCutoff(30, now).toISOString(), "2026-10-01T12:00:00.000Z");
  assert.equal(retentionCutoff(0, now), null);
  assert.equal(retentionCutoff(-5, now), null);
});

test("renditions live under the record's own prefix; old records fall back to their title", () => {
  assert.equal(outputPrefixOf({ outputPrefix: "videos/abc", fileName: "x" }), "videos/abc");
  assert.equal(outputPrefixOf({ fileName: "Old Clip" }), "videos/Old Clip");
});

test("limits default to safe values and are configurable", () => {
  const d = loadConfig({});
  assert.equal(d.limits.uploadsPerDayGlobal, 100);
  assert.equal(d.retentionDays, 30);
  const c = loadConfig({ GLOBAL_DAILY_UPLOADS: "50", RETENTION_DAYS: "7" });
  assert.equal(c.limits.uploadsPerDayGlobal, 50);
  assert.equal(c.retentionDays, 7);
  assert.equal(loadConfig({ RETENTION_DAYS: "0" }).retentionDays, 0);
});
