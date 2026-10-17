const { dispatchAvailable, config } = require("./jobDispatcher.js");

// Backstop poll: normally jobs are dispatched the moment they arrive or a slot frees up (S3 trigger / webhook).
// The poll also retries jobs that were re-queued after a failed RunTask and refills slots after a restart.
async function processQueue() {
  try {
    await dispatchAvailable();
  } catch (error) {
    console.error("Error processing the queue:", error);
  }
}

setInterval(processQueue, config.leakIntervalMs);
