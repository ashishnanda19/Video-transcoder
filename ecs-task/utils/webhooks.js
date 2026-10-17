const axios = require("axios");
const { VIDEO_PROCESS_STATES } = require("./constants.js");

const webhook = process.env.WEBHOOK_URL;
console.log("Webhook URL:", webhook || "(not set: status callbacks are skipped)");

// With no WEBHOOK_URL (e.g. scripts/verify-aws.js, where nothing public can receive the callback) the job still
// runs; the caller reads the result from ECS/S3 instead. A set-but-failing webhook still fails the job.
const jobId = process.env.JOB_ID;
const jobToken = process.env.JOB_TOKEN; // HMAC(secret, jobId): proves this callback comes from this job's container
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A lost callback leaves the job "starting" forever and its concurrency slot taken, so retry transient failures
// (server restarting, tunnel hiccup, cold start) with backoff: 2s, 4s, 8s, 16s, 32s.
const post = async (body, { attempts = 6, baseDelayMs = 2000 } = {}) => {
  if (!webhook) return { status: 200, skipped: true };
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await axios.post(
        webhook,
        { ...body, ...(jobId ? { jobId } : {}) },
        { timeout: 15000, headers: jobToken ? { "X-Job-Token": jobToken } : {} }
      );
    } catch (error) {
      lastError = error;
      const status = error.response && error.response.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) break; // a client error will not fix itself
      if (i < attempts - 1) {
        console.log(`Webhook attempt ${i + 1} failed (${status || error.code || error.message}); retrying...`);
        await sleep(baseDelayMs * 2 ** i);
      }
    }
  }
  throw lastError;
};

const markTaskCompleted = async (key, allFilesObjects) => {
  try {
    const response = await post({
      key,
      progress: VIDEO_PROCESS_STATES.COMPLETED,
      videoResolutions: allFilesObjects,
    });

    if (response.status === 200) {
      console.log("Webhook called successfully!");
    }
  } catch (error) {
    console.log("Error while calling webhook:", error);
    process.exit(1);
  }
};

// Tells the server the container is actually up (STARTING -> PROCESSING). On the GPU path this fires only
// after the ASG scaled out, the image was pulled and the container started, so it is the real "work began".
// Best effort: a lost "processing" ping must never fail the job.
const markTaskProcessing = async (key) => {
  try {
    await post({ key, progress: VIDEO_PROCESS_STATES.PROCESSING, videoResolutions: {} });
  } catch (error) {
    console.log("Could not report processing state (continuing):", error.message);
  }
};

const markTaskFailed = async (key) => {
  try {
    const response = await post({
      key,
      progress: VIDEO_PROCESS_STATES.FAILED,
      videoResolutions: {},
    });

    if (response.status === 200) {
      console.log("Webhook called successfully");
    }
  } catch (error) {
    console.log("Error while calling webhook:", error);
    throw error;
  }
};

module.exports = {
  markTaskProcessing,
  markTaskCompleted,
  markTaskFailed,
};
