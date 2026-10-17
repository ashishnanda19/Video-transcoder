const { asyncHandler } = require("../utils/asyncHandler.js");
const { enqueueJobInQueue } = require("../db/redis.js");
const { decodeS3EventKey } = require("../utils/s3Key.js");
const { webhookVideoQuery } = require("../utils/webhookQuery.js");
const { verifyJobToken } = require("../utils/webhookAuth.js");
const { VIDEO_PROCESS_STATES } = require("../constants.js");
const { loadConfig } = require("../config.js");
const { dispatchAvailable, onJobFinished } = require("../jobs/jobDispatcher.js");
const Video = require("../models/video.model.js");
const { deleteObjectFile } = require("../utils/s3SignedUrl.js");

const config = loadConfig();
const RUNGS = ["1080p", "720p", "480p", "360p"];

// The S3 "object created" event (Lambda -> here). The record already exists: it was created, with its owner and a
// unique key, when the signed upload URL was issued. This only moves it from `pending` to the queue.
const handleS3Trigger = asyncHandler(async (req, res) => {
  const { s3EventData } = req.body || {};
  if (!s3EventData || !s3EventData.object || !s3EventData.object.key) {
    return res.status(400).json({ message: "S3 Event Data not found!" });
  }

  // Event keys are URL-encoded ('+' for spaces); the real object key is the decoded one.
  const key = decodeS3EventKey(s3EventData.object.key);

  // Atomic claim: S3 delivers at least once and Lambda retries, so only the first delivery for a pending record wins.
  const video = await Video.findOneAndUpdate(
    { objectKey: key, progress: VIDEO_PROCESS_STATES.PENDING },
    { $set: { progress: VIDEO_PROCESS_STATES.QUEUED } },
    { new: true }
  );
  if (!video) {
    // Unknown object (not created through the upload API) or already handled: acknowledge so nothing retries forever.
    return res.status(200).json({ message: "Nothing to do for this object" });
  }

  await enqueueJobInQueue({
    videoId: String(video._id), // the container echoes this back so its callback hits THIS record
    fileName: video.fileName,
    objectKey: video.objectKey,
    outputPrefix: video.outputPrefix,
    progress: VIDEO_PROCESS_STATES.QUEUED,
  });

  try {
    await dispatchAvailable();
  } catch (error) {
    // The job is safely queued; the poll loop will retry.
    console.error("Dispatch after enqueue failed:", error);
  }

  return res.status(200).json({ message: "Video transcoding job accepted for " + video.fileName });
});

// Status callbacks from the transcoding container.
const handleECSTrigger = asyncHandler(async (req, res) => {
  const { key, jobId, progress, videoResolutions } = req.body || {};

  // Each container holds a token derived from its own job id, so it can only report on that job.
  if (config.webhookSecret && !verifyJobToken(jobId, req.get("x-job-token"), config.webhookSecret)) {
    return res.status(401).json({ message: "Invalid job credentials" });
  }
  if (jobId && !/^[a-f0-9]{24}$/i.test(String(jobId))) {
    return res.status(400).json({ message: "Invalid job id" });
  }

  const lookup = webhookVideoQuery({ key, jobId });
  const video = await (lookup.sort ? Video.findOne(lookup.filter).sort(lookup.sort) : Video.findOne(lookup.filter));

  if (!video) {
    return res.status(404).json({ message: "video not found!" });
  }

  if (progress === VIDEO_PROCESS_STATES.PROCESSING) {
    // The container is up (STARTING -> PROCESSING). The job still holds its slot, so don't release it.
    // Never move a finished job backwards if pings arrive out of order.
    if (video.progress === VIDEO_PROCESS_STATES.STARTING || video.progress === VIDEO_PROCESS_STATES.QUEUED) {
      video.progress = VIDEO_PROCESS_STATES.PROCESSING;
      await video.save();
    }
    return res.status(200).json({ message: "Processing state recorded" });
  }

  if (progress !== VIDEO_PROCESS_STATES.COMPLETED && progress !== VIDEO_PROCESS_STATES.FAILED) {
    return res.status(400).json({ message: `Unknown progress "${progress}"` });
  }

  // A retried webhook must not release a second slot for the same job.
  const alreadyFinished =
    video.progress === VIDEO_PROCESS_STATES.COMPLETED || video.progress === VIDEO_PROCESS_STATES.FAILED;

  if (progress === VIDEO_PROCESS_STATES.COMPLETED) {
    // Only known renditions, and only bare file names (the server builds the full key itself).
    const safe = {};
    for (const rung of RUNGS) {
      const file = videoResolutions && videoResolutions[rung];
      if (typeof file === "string" && file && !file.includes("/") && !file.includes("..")) safe[rung] = file;
    }
    video.progress = VIDEO_PROCESS_STATES.COMPLETED;
    video.videoResolutions = safe;
    await video.save();
    await deleteObjectFile(video.objectKey); // deleted the file from temp s3 bucket
  } else {
    video.progress = VIDEO_PROCESS_STATES.FAILED;
    await video.save();
  }

  // Free this job's slot and immediately start the next queued job(s).
  const started = alreadyFinished ? await dispatchAvailable() : await onJobFinished();

  return res.status(200).json({
    message: `Trigger from ECS: ${started} queued job(s) started`,
  });
});

module.exports = { handleS3Trigger, handleECSTrigger };
