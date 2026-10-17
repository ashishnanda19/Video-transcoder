const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { runProcess } = require("./exec.js");

// Functional GPU check: decodes a tiny clip with NVDEC, scales on the GPU, encodes with NVENC.
// Catches what `nvidia-smi` alone cannot (missing `video` driver capability, driver/header mismatch,
// ffmpeg built without CUDA filters). Returns { ok, reason } and never throws.
async function probeGpu(config, run = runProcess) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gpuprobe-"));
  const clip = path.join(dir, "probe.mp4");
  try {
    // CPU-encoded source so the probe depends only on GPU components for the stages under test.
    const gen = await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", clip,
    ]);
    if (gen.code !== 0) return { ok: false, reason: `could not create probe clip: ${gen.stderrTail.trim()}` };

    const encoder = config.gpu.codec === "hevc" ? "hevc_nvenc" : "h264_nvenc";
    const probe = await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-i", clip,
      "-vf", `${config.gpu.scaler}=160:120:format=nv12`,
      "-c:v", encoder, "-f", "null", "-",
    ]);
    if (probe.code !== 0) return { ok: false, reason: probe.stderrTail.trim() || `ffmpeg exited ${probe.code}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { probeGpu };
