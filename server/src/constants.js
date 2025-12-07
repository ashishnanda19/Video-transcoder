
const VIDEO_PROCESS_STATES = {
    PENDING: "pending",
    QUEUED: "queued",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
  };
  
  const REDIS_KEYS = {
    CURRENT_VIDEO_TRANSCODING_JOB_COUNT: "CURRENT_VIDEO_TRANSCODING_JOB_COUNT",
    VIDEO_TRANSCODING_QUEUE: "VIDEO_TRANSCODING_QUEUE",
  };
  
  const DB_NAME="video-transcoding-service"
  
  module.exports = {
    VIDEO_PROCESS_STATES,
    REDIS_KEYS,
    DB_NAME
  };

