#!/usr/bin/env node
// Transcodes ONE source through up to four variants and prints wall time, CPU/GPU utilisation and output sizes.
//
//   cpu-separate   libx264, one ffmpeg process per rung   (the legacy production path)
//   cpu-split      libx264, one process: decode once, 4 encodes
//   gpu-separate   NVDEC + scale_cuda + NVENC, one process per rung (4 decodes)
//   gpu-split      NVDEC + scale_cuda + NVENC, one process: decode once, 4 encodes
//
// Usage (inside the GPU container or on a GPU box):
//   node benchmark/benchmark.js --input sample.mp4 [--out benchmark/out] [--variants gpu-split,cpu-separate] [--repeat 3]
//
// There is deliberately NO automatic CPU fallback here: a GPU variant that cannot run is reported as FAILED
// rather than silently measuring the CPU under a GPU label.
const fs = require("node:fs");
const path = require("node:path");
const { readConfig } = require("../utils/transcodeConfig.js");
const { probeSource } = require("../utils/probe.js");
const { buildJob } = require("../utils/ffmpegCommand.js");
const { runCommands } = require("../utils/transcode.js");
const { startCpuSampler, startGpuSampler } = require("./samplers.js");

const ALL = ["cpu-separate", "cpu-split", "gpu-separate", "gpu-split"];

function parseArgs(argv) {
  const a = { out: path.join(__dirname, "out"), variants: ALL, repeat: 1 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--input") a.input = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--variants") a.variants = argv[++i].split(",");
    else if (k === "--repeat") a.repeat = Number(argv[++i]);
    else throw new Error(`Unknown argument ${k}`);
  }
  if (!a.input) throw new Error("--input <file> is required");
  for (const v of a.variants) if (!ALL.includes(v)) throw new Error(`Unknown variant ${v}; choose from ${ALL.join(",")}`);
  return a;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const pct = (s) => (s ? `${s.avg.toFixed(0)}/${s.peak.toFixed(0)}` : "n/a");

async function runVariant(variant, args, source) {
  const [mode, strategy] = variant.split("-");
  const dir = path.join(args.out, variant);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const config = readConfig({ ...process.env, TRANSCODE_MODE: mode, TRANSCODE_STRATEGY: strategy });
  const job = buildJob({ config, mode, strategy, input: path.resolve(args.input), outputDir: dir, baseName: "bench", source });

  const cpu = startCpuSampler();
  const gpu = mode === "gpu" ? startGpuSampler() : { stop: () => null };
  const t0 = process.hrtime.bigint();
  const result = await runCommands(job.commands);
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  const cpuStats = cpu.stop();
  const gpuStats = gpu.stop();

  if (!result.ok) return { variant, ok: false, error: result.stderrTail.trim().split("\n").slice(-3).join(" | ") };
  const sizes = Object.fromEntries(job.outputs.map((o) => [o.name, fs.statSync(o.path).size]));
  return {
    variant, ok: true, seconds, cpu: cpuStats, gpu: gpuStats, sizes, dir,
    totalBytes: Object.values(sizes).reduce((a, b) => a + b, 0),
    outputs: job.outputs.map((o) => ({ name: o.name, path: o.path, width: o.width, height: o.height })),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  const source = await probeSource(path.resolve(args.input));
  console.log(`Source: ${source.width}x${source.height} ${source.videoCodec} ${source.durationSec.toFixed(1)}s audio=${source.audioCodec}`);
  console.log(`Variants: ${args.variants.join(", ")}  repeat=${args.repeat}\n`);

  const results = [];
  for (const variant of args.variants) {
    const runs = [];
    for (let i = 0; i < args.repeat; i++) {
      process.stdout.write(`running ${variant} (${i + 1}/${args.repeat}) ... `);
      const r = await runVariant(variant, args, source);
      console.log(r.ok ? `${r.seconds.toFixed(1)}s` : `FAILED: ${r.error}`);
      runs.push(r);
    }
    const good = runs.filter((r) => r.ok);
    // Report the median run; the others are in results.json.
    const median = good.sort((a, b) => a.seconds - b.seconds)[Math.floor(good.length / 2)];
    results.push(median ? { ...median, runs: good.map((r) => r.seconds) } : runs[0]);
  }

  const base = results.find((r) => r.variant === "cpu-separate" && r.ok);
  console.log("\nvariant        wall(s)  speedup  CPU% avg/peak  GPU-sm% avg/peak  NVENC% avg/peak  NVDEC% avg/peak  VRAM MiB peak  total MB");
  for (const r of results) {
    if (!r.ok) { console.log(`${r.variant.padEnd(14)} FAILED  ${r.error}`); continue; }
    const speed = base ? `${(base.seconds / r.seconds).toFixed(2)}x` : "n/a";
    console.log(
      `${r.variant.padEnd(14)} ${r.seconds.toFixed(1).padStart(7)}  ${speed.padStart(7)}  ${pct(r.cpu).padStart(13)}  ` +
      `${pct(r.gpu && r.gpu.sm).padStart(16)}  ${pct(r.gpu && r.gpu.enc).padStart(15)}  ${pct(r.gpu && r.gpu.dec).padStart(15)}  ` +
      `${(r.gpu && r.gpu.fbMiB ? r.gpu.fbMiB.peak.toFixed(0) : "n/a").padStart(13)}  ${mb(r.totalBytes).padStart(8)}`
    );
  }
  console.log("\nPer-rung output size (MB):");
  for (const r of results.filter((x) => x.ok)) {
    console.log(`  ${r.variant.padEnd(14)} ${Object.entries(r.sizes).map(([n, b]) => `${n}=${mb(b)}`).join("  ")}`);
  }
  if (results.some((r) => r.ok && r.variant.startsWith("gpu") && !r.gpu)) {
    console.log("\nNote: GPU utilisation unavailable (nvidia-smi dmon produced no data).");
  }

  const file = path.join(args.out, "results.json");
  fs.writeFileSync(file, JSON.stringify({ input: path.resolve(args.input), source, results }, null, 2));
  console.log(`\nWrote ${file}. Next: node benchmark/quality.js --results ${file}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
