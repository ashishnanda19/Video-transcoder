const axios = require("axios");
const { VIDEO_PROCESS_STATES } = require("./constants.js");

const webhook = process.env.WEBHOOK_URL;
console.log("Webhook URL:", webhook);

const markTaskCompleted = async (key, allFilesObjects) => {
  try {
    const response = await axios.post(webhook, {
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
    await axios.post(webhook, { key, progress: VIDEO_PROCESS_STATES.PROCESSING, videoResolutions: {} });
  } catch (error) {
    console.log("Could not report processing state (continuing):", error.message);
  }
};

const markTaskFailed = async (key) => {
  try {
    const response = await axios.post(webhook, {
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
