const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeS3EventKey } = require("../src/utils/s3Key.js");

test("plus signs in S3 event keys are spaces", () => {
  assert.equal(
    decodeS3EventKey("uploads/videos/Green+Screen+Laughing+Dog+Meme+1080P.mp4"),
    "uploads/videos/Green Screen Laughing Dog Meme 1080P.mp4"
  );
});

test("percent-escapes are decoded and an encoded plus stays a plus", () => {
  assert.equal(decodeS3EventKey("uploads/videos/a%28b%29+c%2Bd.mp4"), "uploads/videos/a(b) c+d.mp4");
  assert.equal(decodeS3EventKey("uploads/videos/caf%C3%A9.mp4"), "uploads/videos/café.mp4");
});

test("keys without special characters are unchanged", () => {
  assert.equal(decodeS3EventKey("uploads/videos/clip-1.mp4"), "uploads/videos/clip-1.mp4");
});
