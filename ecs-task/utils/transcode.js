const fs = require("node:fs");
const { buildJob, GpuUnsupportedError } = require("./ffmpegCommand.js");
const { runProcess } = require("./exec.js");
const { probeGpu } = require("./gpuProbe.js");

// Runs every command of a job. `separate` jobs run in parallel (as the legacy path did);
// the first failure kills the rest so we don't keep burning the GPU/CPU on a doomed job.
async function runCommands(commands, run = runProcess) {
  const children = [];
  let failure = null;
  const results = await Promise.all(
    commands.map(async (cmd) => {
      const res = await run("ffmpeg", cmd.args, { onSpawn: (c) => children.push(c) });
      if (res.code !== 0 && !failure) {
        failure = { outputs: cmd.outputs, code: res.code, stderrTail: res.stderrTail };
        children.forEach((c) => { try { c.kill("SIGKILL"); } catch (_) { /* already gone */ } });
      }
      return res;
    })
  );
  return failure ? { ok: false, ...failure } : { ok: true, results };
}

const removeQuietly = (p) => { try { fs.rmSync(p, { force: true }); } catch (_) { /* best effort */ } };

// Decides GPU vs CPU, runs it, and falls back to CPU (logging why) if the GPU path cannot run.
// `deps` exists so tests can substitute the probe/runner without spawning ffmpeg.
async function transcodeWithFallback(ctx, deps = {}) {
  const { config, input, outputDir, baseName, source } = ctx;
  const log = deps.log || console.log;
  const probe = deps.probeGpu || probeGpu;
  const runJob = deps.runCommands || runCommands;
  const timer = deps.now || Date.now;

  const attempt = async (mode) => {
    const job = buildJob({ config, mode, input, outputDir, baseName, source });
    const started = timer();
    const result = await runJob(job.commands);
    const seconds = (timer() - started) / 1000;
    if (!result.ok) {
      job.outputs.forEach((o) => removeQuietly(o.path));
      return { ok: false, reason: `ffmpeg exited ${result.code} (${result.outputs.join(",")}): ${result.stderrTail.trim()}` };
    }
    log(`[transcode] ${JSON.stringify({ mode: job.mode, strategy: job.strategy, seconds, outputs: job.outputs.length })}`);
    return { ok: true, job, seconds };
  };

  let fallbackReason = null;
  if (config.mode === "gpu") {
    const gpu = await probe(config);
    if (!gpu.ok) {
      fallbackReason = `GPU probe failed: ${gpu.reason}`;
    } else {
      try {
        const res = await attempt("gpu");
        if (res.ok) return { modeUsed: "gpu", ...res, fallbackReason: null };
        fallbackReason = `GPU transcode failed: ${res.reason}`;
      } catch (err) {
        if (!(err instanceof GpuUnsupportedError)) throw err;
        fallbackReason = `GPU cannot process this input: ${err.message}`;
      }
    }
    if (!config.fallbackToCpu) throw new Error(`${fallbackReason} (GPU_FALLBACK_TO_CPU=false)`);
    log(`[transcode] FALLING BACK TO CPU (libx264): ${fallbackReason}`);
  }

  const res = await attempt("cpu");
  if (!res.ok) throw new Error(`CPU transcode failed: ${res.reason}`);
  return { modeUsed: "cpu", ...res, fallbackReason };
}

module.exports = { transcodeWithFallback, runCommands };
