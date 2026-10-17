const { asyncHandler } = require("../utils/asyncHandler.js");


const { enqueueJobInQueue } = require("../db/redis.js");
const { decodeS3EventKey } = require("../utils/s3Key.js");
const { webhookVideoQuery } = require("../utils/webhookQuery.js");

const { VIDEO_PROCESS_STATES } = require("../constants.js");

const { dispatchAvailable, onJobFinished } = require("../jobs/jobDispatcher.js");
const Video = require("../models/video.model.js");

const { deleteObjectFile } = require("../utils/s3SignedUrl.js");

const handleS3Trigger = asyncHandler(async (req, res) => {
  console.log("Trigger from S3.....");

  const { s3EventData } = req.body;

  if (!s3EventData) {
    return res.status(400).json({ message: "S3 Event Data not found!" });
  }

  console.log("S3 Event Data", s3EventData);

  /*
   2024-03-02T11:52:19.234Z	be8e0a39-aeab-4624-bf95-26a6d373cfe6	INFO	Received S3 event with object details: {
     s3SchemaVersion: '1.0',
     configurationId: 'upload-trigger-api',
     bucket: {
       name: 'video-transcoder-temp',
       ownerIdentity: { principalId: 'A1GP8KJ6WPNITN' },
       arn: 'arn:aws:s3:::video-transcoder-temp'
     },
     object: {
       key: 'uploads/videos/VID-20230711-WA0065.mp4',
       size: 2654509,
       eTag: 'a8bbec5f232fa3629ee302bc36def510',
       sequencer: '0065E312F182AD832A'
     }
   }
   */

  // Event keys are URL-encoded ('+' for spaces); the real object key is the decoded one.
  const key = decodeS3EventKey(s3EventData.object.key);
  const fileName = key.split("/").pop().split(".")[0];

  // S3 delivers events at least once, and a double-click uploads twice. Don't start a second job (and a second
  // worker writing the same outputs) for an object that is already queued or running.
  const inFlight = await Video.findOne({
    objectKey: key,
    progress: { $in: [VIDEO_PROCESS_STATES.PENDING, VIDEO_PROCESS_STATES.QUEUED, VIDEO_PROCESS_STATES.STARTING, VIDEO_PROCESS_STATES.PROCESSING] },
  });
  if (inFlight) {
    return res.status(200).json({ message: "Already in progress for " + fileName });
  }

  const video = await Video.create({
    fileName: fileName,
    objectKey: key,
    progress: VIDEO_PROCESS_STATES.PENDING,
  });

  if (!video) {
    return res.status(500).json({
      message: "Failed to create video. Please try again later.",
    });
  }

  // Every job goes through the queue so ordering and the concurrency limit have a single code path.
  // If a slot is free (and, on GPU, the ASG is scaling 0 -> 1) it is dispatched immediately; otherwise it
  // simply waits in Redis for the next freed slot.
  await enqueueJobInQueue({
    videoId: String(video._id), // the container echoes this back so its callback hits THIS record
    fileName,
    objectKey: key,
    progress: VIDEO_PROCESS_STATES.QUEUED,
  });
  video.progress = VIDEO_PROCESS_STATES.QUEUED;
  await video.save();

  try {
    await dispatchAvailable();
  } catch (error) {
    // The job is safely queued; the poll loop will retry.
    console.error("Dispatch after enqueue failed:", error);
  }

  return res.status(200).json({
    message: "Video transcoding job accepted for " + fileName,
  });
});

const handleECSTrigger = asyncHandler(async (req, res) => {
  console.log("Trigger from ECS.....");
  //webhook
  const { key, jobId, progress, videoResolutions } = req.body;

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
    video.progress = VIDEO_PROCESS_STATES.COMPLETED;
    video.videoResolutions = videoResolutions;
    await video.save();
    await deleteObjectFile(key); // deleted the file from temp s3 bucket
  } else {
    video.progress = VIDEO_PROCESS_STATES.FAILED;
    video.videoResolutions = videoResolutions;
    await video.save();
  }

  // Free this job's slot and immediately start the next queued job(s).
  const started = alreadyFinished ? await dispatchAvailable() : await onJobFinished();

  return res.status(200).json({
    message: `Trigger from ECS: ${started} queued job(s) started`,
  });
});

module.exports = { handleS3Trigger, handleECSTrigger };
