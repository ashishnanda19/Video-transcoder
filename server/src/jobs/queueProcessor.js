const { getQueueLength, deQueueJobFromQueue, increment, decrement, getKey } = require("../db/redis.js");
const { triggerTranscodingJob } = require("../utils/ecsTranscodingTrigger.js");
const Video = require("../models/video.model.js");
const { VIDEO_PROCESS_STATES, REDIS_KEYS } = require("../constants.js");

const MAX_CONCURRENT_JOBS = 5;
const POLL_INTERVAL_MS = 20000; // 20 seconds

async function processQueue() {
  try {
    const currentJobCount = parseInt(await getKey(REDIS_KEYS.CURRENT_VIDEO_TRANSCODING_JOB_COUNT)) || 0;
    const queueLength = await getQueueLength();
    const availableSlots = MAX_CONCURRENT_JOBS - currentJobCount;

    if (queueLength > 0 && availableSlots > 0) {
      const jobsToProcess = Math.min(queueLength, availableSlots);

      for (let i = 0; i < jobsToProcess; i++) {
        const job = await deQueueJobFromQueue();
        if (job) {
          job.progress = VIDEO_PROCESS_STATES.PROCESSING;

          await increment(REDIS_KEYS.CURRENT_VIDEO_TRANSCODING_JOB_COUNT);
          await triggerTranscodingJob(job);

          await Video.findOneAndUpdate(
            { objectKey: job.objectKey },
            { $set: { progress: job.progress } }
          );

          console.log(`Transcoding job triggered successfully for: ${job.fileName}`);
        }
      }
    }
  } catch (error) {
    console.error("Error processing the queue:", error);
  }
}

// Start polling
setInterval(processQueue, POLL_INTERVAL_MS);
