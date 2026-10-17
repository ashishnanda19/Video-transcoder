// Reads every transcode-related env var in one place so the command builder stays pure.

const DEFAULT_LADDER = [
  // short-side resolution + target bitrate (kbps). Max rate is 1.5x, buffer 2x (see ffmpegCommand.js).
  { name: "1080p", height: 1080, kbps: 5000 },
  { name: "720p", height: 720, kbps: 2800 },
  { name: "480p", height: 480, kbps: 1400 },
  { name: "360p", height: 360, kbps: 800 },
];

// "1080p=5000,720p=2800" -> overrides kbps of matching rungs; unknown names are ignored loudly.
function parseLadder(spec, base = DEFAULT_LADDER) {
  if (!spec) return base.map((r) => ({ ...r }));
  const overrides = {};
  for (const part of spec.split(",")) {
    const [name, kbps] = part.split("=").map((s) => s.trim());
    const value = Number(kbps);
    if (!name || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid LADDER_KBPS entry "${part}" (expected e.g. 1080p=5000)`);
    }
    if (!base.some((r) => r.name === name)) {
      throw new Error(`LADDER_KBPS references unknown rung "${name}"`);
    }
    overrides[name] = value;
  }
  return base.map((r) => ({ ...r, kbps: overrides[r.name] ?? r.kbps }));
}

function oneOf(value, allowed, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const v = String(value).toLowerCase();
  if (!allowed.includes(v)) {
    throw new Error(`${name}="${value}" is invalid; expected one of ${allowed.join("|")}`);
  }
  return v;
}

const bool = (value, fallback) =>
  value === undefined || value === "" ? fallback : !["0", "false", "no", "off"].includes(String(value).toLowerCase());

function readConfig(env = process.env) {
  const mode = oneOf(env.TRANSCODE_MODE, ["gpu", "cpu"], "cpu", "TRANSCODE_MODE");
  return {
    mode,
    // GPU decodes once and encodes many (split); the legacy CPU path ran 4 processes.
    strategy: oneOf(env.TRANSCODE_STRATEGY, ["split", "separate"], mode === "gpu" ? "split" : "separate", "TRANSCODE_STRATEGY"),
    fallbackToCpu: bool(env.GPU_FALLBACK_TO_CPU, true),
    ladder: parseLadder(env.LADDER_KBPS),
    audio: {
      mode: oneOf(env.AUDIO_MODE, ["auto", "aac", "copy"], "auto", "AUDIO_MODE"),
      bitrate: env.AUDIO_BITRATE || "128k",
    },
    gpu: {
      codec: oneOf(env.GPU_CODEC, ["h264", "hevc"], "h264", "GPU_CODEC"),
      scaler: oneOf(env.GPU_SCALER, ["scale_cuda", "scale_npp"], "scale_cuda", "GPU_SCALER"),
      preset: env.NVENC_PRESET || "p4",
      tune: env.NVENC_TUNE || "hq",
      cq: Number(env.NVENC_CQ || 23),
      // HEVC reaches similar quality at lower bitrate; the factor scales the ladder when GPU_CODEC=hevc.
      hevcBitrateFactor: Number(env.HEVC_BITRATE_FACTOR || 0.7),
    },
    cpu: {
      preset: env.CPU_PRESET || "medium", // libx264 defaults, i.e. what the old path implicitly used
      crf: Number(env.CPU_CRF || 23),
      capBitrate: bool(env.CPU_USE_LADDER, false), // apply maxrate/bufsize from the ladder for apples-to-apples tests
    },
    logLevel: env.FFMPEG_LOGLEVEL || "warning",
  };
}

module.exports = { readConfig, parseLadder, DEFAULT_LADDER };
