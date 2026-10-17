const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDmon, summarize } = require("../benchmark/samplers.js");
const { parseSsim, parsePsnr, parseVmaf } = require("../benchmark/quality.js");

test("parseDmon reads columns by header name", () => {
  const text = [
    "# gpu    sm   mem   enc   dec   jpg   ofa    fb  bar1  ccpm",
    "# Idx     %     %     %     %     %     %    MB    MB    MB",
    "    0    35    12    80    20     0     0  1480     5     0",
    "    0    90    30    95    25     0     0  2210     5     0",
  ].join("\n");
  const rows = parseDmon(text);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[1].sm, rows[1].enc, rows[1].dec, rows[1].fb], [90, 95, 25, 2210]);
  assert.deepEqual(summarize(rows.map((r) => r.enc)), { avg: 87.5, peak: 95 });
});

test("quality parsers", () => {
  assert.equal(parseSsim("[Parsed_ssim_5 @ 0x1] SSIM Y:0.98 U:0.99 V:0.99 All:0.984321 (18.0)"), 0.984321);
  assert.equal(parsePsnr("[Parsed_psnr_8 @ 0x1] PSNR y:40.1 u:42 v:42 average:40.55 min:35 max:50"), 40.55);
  assert.equal(parseVmaf('{"pooled_metrics":{"vmaf":{"mean":94.12}}}'), 94.12);
  assert.equal(parseVmaf("garbage"), null);
});
