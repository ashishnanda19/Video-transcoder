const os = require("node:os");
const { spawn } = require("node:child_process");

// ---- system CPU utilisation (all cores, %), sampled by diffing os.cpus() ticks
function cpuTimes() {
  return os.cpus().reduce((acc, c) => {
    const t = c.times;
    acc.idle += t.idle;
    acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return acc;
  }, { idle: 0, total: 0 });
}

function startCpuSampler(intervalMs = 1000) {
  const samples = [];
  let prev = cpuTimes();
  const timer = setInterval(() => {
    const cur = cpuTimes();
    const total = cur.total - prev.total;
    if (total > 0) samples.push(100 * (1 - (cur.idle - prev.idle) / total));
    prev = cur;
  }, intervalMs);
  return { stop: () => { clearInterval(timer); return summarize(samples); } };
}

// ---- GPU utilisation via `nvidia-smi dmon` (sm / mem / enc / dec %, framebuffer MiB)
// dmon prints "# gpu sm mem enc dec ... fb ..." as a header, then rows of numbers; columns are looked up by name.
function parseDmon(text) {
  let cols = null;
  const rows = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      const names = t.replace(/^#\s*/, "").split(/\s+/);
      // The names header contains letters; the units header ("Idx  %  %  MHz") also starts with '#'.
      if (names.includes("sm") || names.includes("gpu")) cols = names.filter(Boolean);
      continue;
    }
    if (!cols) continue;
    const vals = t.split(/\s+/);
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i] === "-" ? NaN : Number(vals[i]); });
    rows.push(row);
  }
  return rows;
}

function startGpuSampler() {
  let proc;
  let buf = "";
  try {
    proc = spawn("nvidia-smi", ["dmon", "-s", "um", "-d", "1"], { stdio: ["ignore", "pipe", "ignore"] });
  } catch (_) {
    return { available: false, stop: () => null };
  }
  let failed = false;
  proc.on("error", () => { failed = true; });
  proc.stdout.on("data", (d) => { buf += d; });
  return {
    available: true,
    stop: () => {
      proc.kill("SIGTERM");
      if (failed) return null;
      const rows = parseDmon(buf);
      if (!rows.length) return null;
      const col = (name) => summarize(rows.map((r) => r[name]).filter(Number.isFinite));
      return { sm: col("sm"), enc: col("enc"), dec: col("dec"), fbMiB: col("fb") };
    },
  };
}

function summarize(values) {
  if (!values.length) return { avg: 0, peak: 0 };
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, peak: Math.max(...values) };
}

module.exports = { startCpuSampler, startGpuSampler, parseDmon, summarize };
