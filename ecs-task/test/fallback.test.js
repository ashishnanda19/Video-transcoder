const test = require("node:test");
const assert = require("node:assert/strict");
const { transcodeWithFallback } = require("../utils/transcode.js");
const { readConfig } = require("../utils/transcodeConfig.js");

const source = { width: 1920, height: 1080, videoCodec: "h264", pixFmt: "yuv420p", rotation: 0, hasAudio: true, audioCodec: "aac" };
const ctx = (env) => ({ config: readConfig(env), input: "/in.mp4", outputDir: "/tmp/does-not-matter", baseName: "clip", source });
const quiet = () => {};

// A fake runner records which encoder each attempted command used and can fail on demand.
function fakes({ probe = { ok: true }, failEncoder } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      log: quiet,
      probeGpu: async () => probe,
      runCommands: async (commands) => {
        const args = commands[0].args.join(" ");
        const encoder = /nvenc/.test(args) ? "gpu" : "cpu";
        calls.push(encoder);
        if (failEncoder === encoder) return { ok: false, code: 1, outputs: ["1080p"], stderrTail: `${encoder} boom` };
        return { ok: true, results: [] };
      },
    },
  };
}

test("gpu mode with a healthy GPU runs on the GPU only", async () => {
  const f = fakes();
  const r = await transcodeWithFallback(ctx({ TRANSCODE_MODE: "gpu" }), f.deps);
  assert.equal(r.modeUsed, "gpu");
  assert.equal(r.fallbackReason, null);
  assert.deepEqual(f.calls, ["gpu"]);
});

test("failed GPU probe falls back to CPU and records why", async () => {
  const f = fakes({ probe: { ok: false, reason: "no NVENC device" } });
  const r = await transcodeWithFallback(ctx({ TRANSCODE_MODE: "gpu" }), f.deps);
  assert.equal(r.modeUsed, "cpu");
  assert.match(r.fallbackReason, /GPU probe failed: no NVENC device/);
  assert.deepEqual(f.calls, ["cpu"], "must not even attempt the GPU command");
});

test("GPU run failing mid-job falls back to CPU", async () => {
  const f = fakes({ failEncoder: "gpu" });
  const r = await transcodeWithFallback(ctx({ TRANSCODE_MODE: "gpu" }), f.deps);
  assert.equal(r.modeUsed, "cpu");
  assert.match(r.fallbackReason, /GPU transcode failed.*gpu boom/);
  assert.deepEqual(f.calls, ["gpu", "cpu"]);
});

test("input the GPU cannot decode falls back to CPU without spawning a GPU command", async () => {
  const f = fakes();
  const c = ctx({ TRANSCODE_MODE: "gpu" });
  c.source = { ...source, videoCodec: "av1" };
  const r = await transcodeWithFallback(c, f.deps);
  assert.equal(r.modeUsed, "cpu");
  assert.match(r.fallbackReason, /cannot process this input.*av1/);
  assert.deepEqual(f.calls, ["cpu"]);
});

test("GPU_FALLBACK_TO_CPU=false surfaces the GPU failure instead of falling back", async () => {
  const f = fakes({ probe: { ok: false, reason: "driver mismatch" } });
  await assert.rejects(transcodeWithFallback(ctx({ TRANSCODE_MODE: "gpu", GPU_FALLBACK_TO_CPU: "false" }), f.deps), /driver mismatch/);
  assert.deepEqual(f.calls, []);
});

test("cpu mode never probes or touches the GPU", async () => {
  const f = fakes({ probe: { ok: false, reason: "should not be consulted" } });
  const r = await transcodeWithFallback(ctx({ TRANSCODE_MODE: "cpu" }), f.deps);
  assert.equal(r.modeUsed, "cpu");
  assert.equal(r.fallbackReason, null);
  assert.deepEqual(f.calls, ["cpu"]);
});

test("a CPU failure is fatal (nothing left to fall back to)", async () => {
  const f = fakes({ failEncoder: "cpu" });
  await assert.rejects(transcodeWithFallback(ctx({ TRANSCODE_MODE: "cpu" }), f.deps), /CPU transcode failed.*cpu boom/);
});
