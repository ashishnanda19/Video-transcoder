// Pure ffmpeg command construction -- no I/O, so every flag choice is unit-testable.
//
//   mode     gpu | cpu          decode/scale/encode on NVIDIA hardware vs libx264
//   strategy split | separate   one ffmpeg process decoding once and encoding every rung,
//                               vs one process per rung (the legacy behaviour)
const { NVDEC_CODECS } = require("./probe.js");

class GpuUnsupportedError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "GpuUnsupportedError";
  }
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// Each rung is a 16:9 box (1080p = 1920x1080, 720p = 1280x720, ...; flipped for portrait video) and the
// source is scaled to FIT inside it, keeping its aspect ratio. This replaces the old fixed `-s WxH`, which
// squashed everything to 16:9, and stops ultra-wide sources from producing a 2580px-wide "1080p".
// Both sides are forced even (H.264/NVENC requirement), so the ratio is preserved to within 1px.
function computeDimensions(srcWidth, srcHeight, rungHeight) {
  const short = rungHeight;
  const long = even((rungHeight * 16) / 9);
  const [boxW, boxH] = srcWidth >= srcHeight ? [long, short] : [short, long];
  const factor = Math.min(boxW / srcWidth, boxH / srcHeight);
  return { width: even(srcWidth * factor), height: even(srcHeight * factor) };
}

// Fails fast (before spawning anything) on inputs the GPU pipeline cannot take, so the caller can
// fall back to CPU with a precise reason instead of an opaque ffmpeg error.
function assertGpuCompatible(source) {
  if (!NVDEC_CODECS.has(source.videoCodec)) {
    throw new GpuUnsupportedError(`NVDEC (T4) cannot decode "${source.videoCodec}"`);
  }
  if (source.videoCodec === "h264" && /10/.test(source.pixFmt)) {
    throw new GpuUnsupportedError(`NVDEC (T4) cannot decode 10-bit H.264 (${source.pixFmt})`);
  }
  if (source.pixFmt && !/^(yuv420|yuvj420|nv12|p010)/.test(source.pixFmt)) {
    throw new GpuUnsupportedError(`NVDEC (T4) cannot decode chroma format ${source.pixFmt}`);
  }
  if (source.rotation) {
    // ffmpeg's auto-rotate would need a CPU transpose filter, which cannot take CUDA frames.
    throw new GpuUnsupportedError(`input has ${source.rotation} degree rotation metadata; rotation is not done on the GPU`);
  }
}

function audioArgs(config, source) {
  if (!source.hasAudio) return [];
  const copy = config.audio.mode === "copy" || (config.audio.mode === "auto" && source.audioCodec === "aac");
  return copy ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", config.audio.bitrate];
}

function rungKbps(config, rung, mode) {
  const factor = mode === "gpu" && config.gpu.codec === "hevc" ? config.gpu.hevcBitrateFactor : 1;
  return Math.round(rung.kbps * factor);
}

function videoEncodeArgs(config, rung, mode) {
  const kbps = rungKbps(config, rung, mode);
  const rate = ["-b:v", `${kbps}k`, "-maxrate", `${Math.round(kbps * 1.5)}k`, "-bufsize", `${kbps * 2}k`];
  if (mode === "gpu") {
    const hevc = config.gpu.codec === "hevc";
    return [
      "-c:v", hevc ? "hevc_nvenc" : "h264_nvenc",
      "-preset", config.gpu.preset,
      "-tune", config.gpu.tune,
      "-rc", "vbr",
      "-cq", String(config.gpu.cq),
      ...rate,
      "-profile:v", hevc ? "main" : "high",
      ...(hevc ? ["-tag:v", "hvc1"] : []), // hvc1 so Safari/QuickTime play the mp4
    ];
  }
  return [
    "-c:v", "libx264",
    "-preset", config.cpu.preset,
    "-crf", String(config.cpu.crf),
    ...(config.cpu.capBitrate ? rate : []),
    "-pix_fmt", "yuv420p",
  ];
}

function scaleFilter(config, mode, dims) {
  if (mode === "gpu") {
    // format=nv12 keeps the frame on the GPU while normalising 10-bit/other surfaces for NVENC.
    return `${config.gpu.scaler}=${dims.width}:${dims.height}:format=nv12`;
  }
  return `scale=${dims.width}:${dims.height}`;
}

function decodeArgs(mode) {
  // -hwaccel_output_format cuda keeps decoded frames in GPU memory (no download to system RAM).
  return mode === "gpu" ? ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"] : [];
}

function buildJob({ config, mode = config.mode, strategy = config.strategy, input, outputDir, baseName, source }) {
  if (mode === "gpu") assertGpuCompatible(source);

  const outputs = config.ladder.map((rung) => ({
    name: rung.name,
    file: `${baseName}-${rung.name}.mp4`,
    path: `${outputDir.replace(/\/$/, "")}/${baseName}-${rung.name}.mp4`,
    ...computeDimensions(source.width, source.height, rung.height),
    rung,
  }));

  const head = ["-hide_banner", "-nostdin", "-y", "-loglevel", config.logLevel, ...decodeArgs(mode), "-i", input];
  const perOutput = (out, videoLabel) => [
    "-map", videoLabel,
    ...(source.hasAudio ? ["-map", "0:a:0?"] : []),
    ...videoEncodeArgs(config, out.rung, mode),
    ...audioArgs(config, source),
    "-f", "mp4",
    out.path,
  ];

  let commands;
  if (strategy === "split") {
    const labels = outputs.map((_, i) => `[s${i}]`).join("");
    const chains = outputs.map((o, i) => `[s${i}]${scaleFilter(config, mode, o)}[v${i}]`);
    const graph = [`[0:v:0]split=${outputs.length}${labels}`, ...chains].join(";");
    commands = [{
      outputs: outputs.map((o) => o.name),
      args: [...head, "-filter_complex", graph, ...outputs.flatMap((o, i) => perOutput(o, `[v${i}]`))],
    }];
  } else {
    commands = outputs.map((o) => ({
      outputs: [o.name],
      args: [...head, "-vf", scaleFilter(config, mode, o), ...perOutput(o, "0:v:0")],
    }));
  }

  return { mode, strategy, outputs, commands };
}

module.exports = { buildJob, computeDimensions, assertGpuCompatible, GpuUnsupportedError };
