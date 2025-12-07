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
  markTaskCompleted,
  markTaskFailed,
};
