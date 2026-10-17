const { spawn } = require("node:child_process");

const TAIL_BYTES = 4000;

// Spawns a process, buffering stdout and keeping only the tail of stderr (where ffmpeg prints the cause).
// Returns { code, stdout, stderrTail, child } where `child` is only useful for the live handle (kill).
function runProcess(cmd, args, { onSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (onSpawn) onSpawn(child);
    let stdout = "";
    let stderrTail = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderrTail = (stderrTail + d).slice(-TAIL_BYTES); });
    child.on("error", (err) => resolve({ code: -1, stdout, stderrTail: `${stderrTail}\nspawn error: ${err.message}` }));
    child.on("close", (code, signal) => resolve({ code: code === null ? -1 : code, signal, stdout, stderrTail }));
  });
}

module.exports = { runProcess };
