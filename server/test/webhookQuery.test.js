const test = require("node:test");
const assert = require("node:assert/strict");
const { webhookVideoQuery } = require("../src/utils/webhookQuery.js");

test("a job id identifies exactly one record, whatever the file name", () => {
  const q = webhookVideoQuery({ key: "uploads/videos/a.mp4", jobId: "665f1c0e8f1b2c3d4e5f6a7b" });
  assert.deepEqual(q.filter, { _id: "665f1c0e8f1b2c3d4e5f6a7b" });
});

test("without a job id (older containers) only in-flight records for the key match, newest first", () => {
  const q = webhookVideoQuery({ key: "uploads/videos/a.mp4" });
  assert.equal(q.filter.objectKey, "uploads/videos/a.mp4");
  assert.deepEqual(q.filter.progress.$in, ["pending", "queued", "starting", "processing"]);
  assert.deepEqual(q.sort, { createdAt: -1 });
});
