// How the ECS webhook finds the video a container is reporting on.
//
// Containers send the job id they were started with (JOB_ID = the Video _id). Looking jobs up by object key alone is
// ambiguous: uploading the same file name twice creates two records with one key, and the second job's callback
// would land on the first record, leaving the second stuck forever (and its limiter slot leaked).
// Older containers only send the key; for them pick the newest record that is still in flight.
const IN_FLIGHT = ["pending", "queued", "starting", "processing"];

function webhookVideoQuery({ key, jobId }) {
  if (jobId) return { filter: { _id: jobId }, sort: null };
  return { filter: { objectKey: key, progress: { $in: IN_FLIGHT } }, sort: { createdAt: -1 } };
}

module.exports = { webhookVideoQuery, IN_FLIGHT };
