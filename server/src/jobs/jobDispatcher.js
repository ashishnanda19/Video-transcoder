// The process-wide dispatcher: real Redis + ECS + Mongo wired into the pure logic in dispatcher.js.
// No timers here, so importing it (e.g. from a controller) has no side effects beyond the connections.
const { acquireSlot, releaseSlot, deQueueJobFromQueue, requeueJobAtFront } = require("../db/redis.js");
const { triggerTranscodingJob } = require("../utils/ecsTranscodingTrigger.js");
const Video = require("../models/video.model.js");
const { VIDEO_PROCESS_STATES } = require("../constants.js");
const { createDispatcher } = require("./dispatcher.js");
const { resolveLimiterConfig } = require("./limiterConfig.js");

const config = resolveLimiterConfig();
console.log(
  `Limiter: mode=${config.mode} maxConcurrentJobs=${config.maxConcurrentJobs} leakRate=${config.leakRate}/tick ` +
    `interval=${config.leakIntervalMs}ms derived=${JSON.stringify(config.derived)}`
);
config.warnings.forEach((w) => console.warn(`Limiter warning: ${w}`));

const dispatcher = createDispatcher({
  config,
  store: { acquireSlot, releaseSlot, dequeue: deQueueJobFromQueue, requeueFront: requeueJobAtFront },
  trigger: triggerTranscodingJob,
  // Only advance jobs that haven't already been moved on by the container's own 'processing' ping.
  markStarting: (job) =>
    Video.findOneAndUpdate(
      { objectKey: job.objectKey, progress: { $in: [VIDEO_PROCESS_STATES.PENDING, VIDEO_PROCESS_STATES.QUEUED] } },
      { $set: { progress: VIDEO_PROCESS_STATES.STARTING } }
    ),
});

module.exports = { ...dispatcher, config };
