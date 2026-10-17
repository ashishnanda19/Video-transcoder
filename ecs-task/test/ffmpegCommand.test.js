const test = require("node:test");
const assert = require("node:assert/strict");
const { buildJob, computeDimensions, GpuUnsupportedError } = require("../utils/ffmpegCommand.js");
const { readConfig, parseLadder } = require("../utils/transcodeConfig.js");
const { parseProbe } = require("../utils/probe.js");

const landscape = { width: 1920, height: 1080, videoCodec: "h264", pixFmt: "yuv420p", rotation: 0, hasAudio: true, audioCodec: "aac" };
const base = { input: "/in.mp4", outputDir: "/out", baseName: "clip" };
const job = (env, over = {}, mode) => buildJob({ config: readConfig(env), source: landscape, mode, ...base, ...over });
const flat = (cmd) => cmd.args.join(" ");

test("gpu/split: one process, decode on GPU, split + scale_cuda per rung, NVENC per output", () => {
  const j = job({ TRANSCODE_MODE: "gpu" });
  assert.equal(j.strategy, "split");
  assert.equal(j.commands.length, 1);
  const cmd = flat(j.commands[0]);
  assert.match(cmd, /-hwaccel cuda -hwaccel_output_format cuda -i \/in\.mp4/);
  assert.match(cmd, /\[0:v:0\]split=4\[s0\]\[s1\]\[s2\]\[s3\]/);
  assert.match(cmd, /\[s0\]scale_cuda=1920:1080:format=nv12\[v0\]/);
  assert.match(cmd, /\[s3\]scale_cuda=640:360:format=nv12\[v3\]/);
  assert.equal((cmd.match(/-c:v h264_nvenc/g) || []).length, 4);
  assert.match(cmd, /-preset p4 -tune hq -rc vbr -cq 23 -b:v 5000k -maxrate 7500k -bufsize 10000k/);
  assert.match(cmd, /-b:v 800k -maxrate 1200k -bufsize 1600k/);
  assert.doesNotMatch(cmd, /libx264|hwdownload/, "frames must never be downloaded or CPU-encoded");
  assert.deepEqual(j.outputs.map((o) => o.file), ["clip-1080p.mp4", "clip-720p.mp4", "clip-480p.mp4", "clip-360p.mp4"]);
});

test("gpu/separate: one process per rung, each decoding on GPU", () => {
  const j = job({ TRANSCODE_MODE: "gpu", TRANSCODE_STRATEGY: "separate" });
  assert.equal(j.commands.length, 4);
  for (const c of j.commands) {
    const s = flat(c);
    assert.match(s, /-hwaccel cuda -hwaccel_output_format cuda/);
    assert.match(s, /-vf scale_cuda=\d+:\d+:format=nv12/);
    assert.match(s, /-c:v h264_nvenc/);
    assert.equal(c.outputs.length, 1);
  }
});

test("cpu/separate (legacy default): libx264 + aac, no CUDA flags", () => {
  const j = job({ TRANSCODE_MODE: "cpu" });
  assert.equal(j.strategy, "separate");
  assert.equal(j.commands.length, 4);
  const s = flat(j.commands[0]);
  assert.match(s, /-vf scale=1920:1080/);
  assert.match(s, /-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p/);
  assert.doesNotMatch(s, /cuda|nvenc|npp/);
});

test("cpu/split is supported (decode once on CPU)", () => {
  const s = flat(job({ TRANSCODE_MODE: "cpu", TRANSCODE_STRATEGY: "split" }).commands[0]);
  assert.match(s, /split=4/);
  assert.match(s, /\[s1\]scale=1280:720\[v1\]/);
});

test("hevc option swaps the encoder, tags hvc1 and scales the ladder", () => {
  const s = flat(job({ TRANSCODE_MODE: "gpu", GPU_CODEC: "hevc" }).commands[0]);
  assert.match(s, /-c:v hevc_nvenc/);
  assert.match(s, /-tag:v hvc1/);
  assert.match(s, /-b:v 3500k/); // 5000k * 0.7
  assert.doesNotMatch(s, /h264_nvenc/);
});

test("scale_npp is selectable", () => {
  assert.match(flat(job({ TRANSCODE_MODE: "gpu", GPU_SCALER: "scale_npp" }).commands[0]), /scale_npp=1920:1080:format=nv12/);
});

test("aspect ratio is preserved with even dimensions (fit inside the rung's 16:9 box)", () => {
  assert.deepEqual(computeDimensions(1920, 1080, 720), { width: 1280, height: 720 });
  assert.deepEqual(computeDimensions(1920, 800, 480), { width: 854, height: 356 }); // 2.4:1 fits the 16:9 box, not squashed
  assert.deepEqual(computeDimensions(1080, 1920, 720), { width: 720, height: 1280 }); // portrait
  assert.deepEqual(computeDimensions(1000, 563, 360), { width: 640, height: 360 });
  assert.deepEqual(computeDimensions(640, 480, 1080), { width: 1440, height: 1080 }); // 4:3 is pillar-free, just narrower
  for (const [w, h] of [[1919, 1081], [853, 481], [3, 7]]) {
    const d = computeDimensions(w, h, 360);
    assert.equal(d.width % 2, 0);
    assert.equal(d.height % 2, 0);
  }
});

test("audio: aac is copied, other codecs re-encoded, missing audio omitted, override honoured", () => {
  const audioOf = (src, env = {}) => flat(buildJob({ config: readConfig({ TRANSCODE_MODE: "cpu", ...env }), source: src, ...base }).commands[0]);
  assert.match(audioOf(landscape), /-c:a copy/);
  assert.match(audioOf({ ...landscape, audioCodec: "opus" }), /-c:a aac -b:a 128k/);
  assert.match(audioOf(landscape, { AUDIO_MODE: "aac" }), /-c:a aac/);
  const silent = audioOf({ ...landscape, hasAudio: false, audioCodec: null });
  assert.doesNotMatch(silent, /-c:a|0:a:0/);
});

test("gpu pre-flight rejects inputs NVDEC/T4 cannot take (so the caller can fall back)", () => {
  const reject = (over) => assert.throws(() => job({ TRANSCODE_MODE: "gpu" }, { source: { ...landscape, ...over } }), GpuUnsupportedError);
  reject({ videoCodec: "av1" });
  reject({ videoCodec: "h264", pixFmt: "yuv420p10le" });
  reject({ pixFmt: "yuv444p" });
  reject({ rotation: 90 });
});

test("cpu mode accepts what the gpu pre-flight rejects", () => {
  assert.doesNotThrow(() => job({ TRANSCODE_MODE: "cpu" }, { source: { ...landscape, videoCodec: "av1", rotation: 90 } }));
});

test("config validation: bad values fail loudly, ladder overrides apply", () => {
  assert.throws(() => readConfig({ TRANSCODE_MODE: "tpu" }), /TRANSCODE_MODE/);
  assert.throws(() => parseLadder("999p=1"), /unknown rung/);
  assert.equal(parseLadder("720p=3000").find((r) => r.name === "720p").kbps, 3000);
  assert.equal(readConfig({}).mode, "cpu", "unset must mean the legacy CPU path");
});

test("parseProbe extracts rotation and audio facts", () => {
  const p = parseProbe({
    streams: [
      { codec_type: "video", width: 1080, height: 1920, codec_name: "h264", pix_fmt: "yuv420p", tags: { rotate: "90" } },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { duration: "12.5" },
  });
  assert.deepEqual([p.rotation, p.hasAudio, p.audioCodec, p.durationSec], [90, true, "aac", 12.5]);
  const side = parseProbe({ streams: [{ codec_type: "video", width: 1, height: 1, side_data_list: [{ rotation: -90 }] }] });
  assert.equal(side.rotation, 270);
});
