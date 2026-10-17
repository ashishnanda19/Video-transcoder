#!/usr/bin/env node
// Renders the landing page's hero video from video-transcoder-client/media/hero-scene.html.
//
//   node scripts/render-hero.mjs [--frames-only <t1,t2,...>]     (needs Google Chrome and ffmpeg; macOS path below)
//
// The scene is a pure function of time, so each frame is captured deterministically (no screen recording, no dropped
// frames) and encoded to public/hero-loop.mp4 (+ a still poster). --frames-only just saves PNGs at those seconds for review.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "video-transcoder-client");
const scene = path.join(root, "media", "hero-scene.html");
const outDir = path.join(root, "public");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 30;
const argv = process.argv.slice(2);
const only = argv.includes("--frames-only") ? argv[argv.indexOf("--frames-only") + 1].split(",").map(Number) : null;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hero-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9337", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${tmp}/profile`, "--no-first-run", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await (await fetch("http://127.0.0.1:9337/json/version")).json(); break; } catch { await sleep(250); } }
const tab = await (await fetch("http://127.0.0.1:9337/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file://" + scene });
for (let i = 0; i < 80 && !(await ev("window.__ready === true")); i++) await sleep(250);
const LOOP = await ev("window.LOOP");
const shot = async (t, format = "png") => {
  await ev(`window.render(${t})`);
  return Buffer.from((await send("Page.captureScreenshot", { format, quality: 94, captureBeyondViewport: false })).data, "base64");
};

if (only) {
  fs.mkdirSync(path.join(tmp, "review"), { recursive: true });
  for (const t of only) { const f = path.join(outDir, `..`, "media", `frame-${t}.png`); fs.writeFileSync(f, await shot(t)); console.log("saved", f); }
} else {
  const n = LOOP * FPS;
  fs.mkdirSync(path.join(tmp, "frames"));
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(path.join(tmp, "frames", `f${String(i).padStart(4, "0")}.jpg`), await shot(i / FPS, "jpeg"));
    if (i % 30 === 0) console.log(`frame ${i}/${n}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(tmp, "frames", "f%04d.jpg"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", path.join(outDir, "hero-loop.mp4")]);
  fs.writeFileSync(path.join(outDir, "hero-poster.jpg"), await shot(5.9, "jpeg"));
  console.log("wrote public/hero-loop.mp4 and public/hero-poster.jpg", (fs.statSync(path.join(outDir, "hero-loop.mp4")).size / 1024).toFixed(0) + " KB");
}
ws.close(); chrome.kill();
await sleep(800); // let Chrome release its profile before deleting it
try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* temp dir; the OS cleans it up */ }
