// Deletes videos (renditions + record) once they are older than RETENTION_DAYS, so a public service does not keep
// strangers' files, and grow its S3 bill, forever. An S3 lifecycle rule (Terraform) is the backstop for the files.
const Video = require("../models/video.model.js");
const { retentionCutoff, isDeletable } = require("../utils/videoLifecycle.js");
const { removeVideoAssets } = require("../controllers/video.contoller.js");
const { loadConfig } = require("../config.js");

const config = loadConfig();
const SWEEP_EVERY_MS = 60 * 60 * 1000;

async function sweepOnce(now = Date.now()) {
  const cutoff = retentionCutoff(config.retentionDays, now);
  if (!cutoff) return 0;
  const old = await Video.find({ createdAt: { $lt: cutoff } }).limit(200).lean();
  let removed = 0;
  for (const video of old) {
    if (!isDeletable(video.progress)) continue; // still running after N days: leave it to the job/webhook
    try {
      await removeVideoAssets(video);
      await Video.deleteOne({ _id: video._id });
      removed++;
    } catch (error) {
      console.error(`Retention: could not remove ${video._id}: ${error.message}`);
    }
  }
  if (removed) console.log(`Retention: removed ${removed} video(s) older than ${config.retentionDays} days`);
  return removed;
}

function startRetentionSweep() {
  if (!config.retentionDays) {
    console.log("Retention sweep disabled (RETENTION_DAYS=0)");
    return;
  }
  console.log(`Retention: videos are deleted after ${config.retentionDays} days`);
  const run = () => sweepOnce().catch((e) => console.error("Retention sweep failed:", e.message));
  setTimeout(run, 60 * 1000).unref(); // shortly after start-up, then hourly
  setInterval(run, SWEEP_EVERY_MS).unref();
}

module.exports = { startRetentionSweep, sweepOnce };
