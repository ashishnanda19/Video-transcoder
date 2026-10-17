#!/usr/bin/env node
// Objective quality of each benchmark variant, per rung: VMAF (if ffmpeg has libvmaf), SSIM and PSNR.
//
//   --against source        (default) every variant vs. the ORIGINAL scaled to the rung. This is the honest
//                           measure: it shows how far each encoder is from the source, so CPU and GPU are
//                           comparable on the same yardstick.
//   --against cpu-separate  GPU/CPU variant vs. the legacy CPU output (only measures mutual difference of two
//                           lossy encodes; a high score does not mean either is good).
//
//   node benchmark/quality.js --results benchmark/out/results.json [--against source|<variant>] [--seconds 30]
//
// Reading the numbers: VMAF >= 93 is generally "visually transparent" for streaming; a CPU->GPU gap under ~2 VMAF
// points at equal bitrate is typical for NVENC (Turing) vs x264 medium. Treat the gap, not the absolute value,
// as the finding, and judge it on real footage -- not the synthetic sample.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runProcess } = require("../utils/exec.js");

function parseArgs(argv) {
  const a = { against: "source", seconds: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--results") a.results = argv[++i];
    else if (argv[i] === "--against") a.against = argv[++i];
    else if (argv[i] === "--seconds") a.seconds = Number(argv[++i]);
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!a.results) throw new Error("--results <results.json> is required");
  return a;
}

// Pure parsers (exported for tests)
const parseSsim = (stderr) => { const m = stderr.match(/SSIM[^\n]*All:([0-9.]+)/); return m ? Number(m[1]) : null; };
const parsePsnr = (stderr) => { const m = stderr.match(/PSNR[^\n]*average:([0-9.]+|inf)/); return m ? (m[1] === "inf" ? Infinity : Number(m[1])) : null; };
const parseVmaf = (json) => { try { return JSON.parse(json).pooled_metrics.vmaf.mean; } catch (_) { return null; } };

async function hasFilter(name) {
  const { stdout } = await runProcess("ffmpeg", ["-hide_banner", "-filters"]);
  return new RegExp(`\\b${name}\\b`).test(stdout);
}

// `dist` is the file under test, `ref` the yardstick; both end up at the rung's WxH, yuv420p, same timebase.
async function measure({ dist, ref, width, height, vmaf, seconds }) {
  const limit = seconds > 0 ? ["-t", String(seconds)] : [];
  const prep =
    `[0:v]scale=${width}:${height}:flags=bicubic,format=yuv420p,setpts=PTS-STARTPTS[dis];` +
    `[1:v]scale=${width}:${height}:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS[ref];`;
  const base = ["-hide_banner", "-nostdin", ...limit, "-i", dist, ...limit, "-i", ref];

  const ssimPsnr = await runProcess("ffmpeg", [
    ...base, "-lavfi", `${prep}[dis]split[d1][d2];[ref]split[r1][r2];[d1][r1]ssim;[d2][r2]psnr`, "-f", "null", "-",
  ]);
  let vmafScore = null;
  if (vmaf) {
    const log = path.join(os.tmpdir(), `vmaf-${process.pid}-${Date.now()}.json`);
    const v = await runProcess("ffmpeg", [
      ...base, "-lavfi", `${prep}[dis][ref]libvmaf=log_fmt=json:log_path=${log}:n_threads=${os.cpus().length}`, "-f", "null", "-",
    ]);
    if (v.code === 0 && fs.existsSync(log)) vmafScore = parseVmaf(fs.readFileSync(log, "utf8"));
    fs.rmSync(log, { force: true });
  }
  return { vmaf: vmafScore, ssim: parseSsim(ssimPsnr.stderrTail), psnr: parsePsnr(ssimPsnr.stderrTail) };
}

async function main() {
  const args = parseArgs(process.argv);
  const data = JSON.parse(fs.readFileSync(args.results, "utf8"));
  const ok = data.results.filter((r) => r.ok);
  const vmaf = await hasFilter("libvmaf");
  if (!vmaf) console.log("NOTE: this ffmpeg has no libvmaf; reporting SSIM/PSNR only (the GPU image includes libvmaf).\n");

  const refVariant = args.against === "source" ? null : ok.find((r) => r.variant === args.against);
  if (args.against !== "source" && !refVariant) throw new Error(`Variant "${args.against}" not in results`);

  console.log(`Reference: ${args.against === "source" ? "original source scaled to each rung" : args.against}\n`);
  console.log("variant        rung    VMAF    SSIM     PSNR(dB)");
  const table = {};
  for (const r of ok) {
    if (refVariant && r.variant === refVariant.variant) continue;
    for (const out of r.outputs) {
      const ref = refVariant ? refVariant.outputs.find((o) => o.name === out.name).path : data.input;
      const m = await measure({ dist: out.path, ref, width: out.width, height: out.height, vmaf, seconds: args.seconds });
      (table[r.variant] = table[r.variant] || {})[out.name] = m;
      const f = (v, d) => (v === null ? "n/a" : v === Infinity ? "inf" : v.toFixed(d));
      console.log(`${r.variant.padEnd(14)} ${out.name.padEnd(6)} ${f(m.vmaf, 2).padStart(6)}  ${f(m.ssim, 4).padStart(7)}  ${f(m.psnr, 2).padStart(8)}`);
    }
  }

  // Headline: GPU minus CPU at the same rung, vs. the same reference.
  const pairs = [["gpu-split", "cpu-separate"], ["gpu-separate", "cpu-separate"]];
  for (const [g, c] of pairs) {
    if (!table[g] || !table[c]) continue;
    console.log(`\n${g} minus ${c} (negative = GPU worse):`);
    for (const rung of Object.keys(table[g])) {
      const d = (k) => (table[g][rung][k] === null || table[c][rung][k] === null ? "n/a" : (table[g][rung][k] - table[c][rung][k]).toFixed(k === "ssim" ? 4 : 2));
      console.log(`  ${rung.padEnd(6)} dVMAF=${d("vmaf")}  dSSIM=${d("ssim")}  dPSNR=${d("psnr")}`);
    }
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseSsim, parsePsnr, parseVmaf };
