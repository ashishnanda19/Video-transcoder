// Leaky-bucket dispatcher: moves jobs from the Redis queue to ECS while respecting the concurrency limit.
//
// A job holds a slot from the moment RunTask succeeds until the container's completed/failed webhook. That
// deliberately includes the time the ECS task spends in PROVISIONING while the ASG scales 0 -> 1 (a few
// minutes): the slot stays taken, so surplus jobs keep waiting in Redis rather than being dropped or piling
// up as unplaceable ECS tasks.
//
// Dependencies are injected so the logic is unit-testable without Redis, Mongo or AWS.
//   store:        { acquireSlot(max) -> bool (atomic), releaseSlot(), dequeue() -> job|null, requeueFront(job) }
//   trigger:      async (job) => starts the ECS task, throws on failure
//   markStarting: async (job) => persists QUEUED -> STARTING
function createDispatcher({ store, trigger, markStarting, config, log = console }) {
  async function dispatchAvailable() {
    let dispatched = 0;

    for (let i = 0; i < config.leakRate; i++) {
      if (!(await store.acquireSlot(config.maxConcurrentJobs))) break; // at capacity: leave the rest queued

      const job = await store.dequeue();
      if (!job) {
        await store.releaseSlot();
        break;
      }

      try {
        await trigger(job);
      } catch (err) {
        // Don't lose the job or leak the slot. Put it back at the head so FIFO order survives, and stop this
        // round instead of hammering a failing API; the next tick/webhook retries.
        await store.releaseSlot();
        await store.requeueFront(job);
        log.error(`Could not start ${job.fileName}; re-queued at the front: ${err.message}`);
        break;
      }

      try {
        await markStarting(job);
      } catch (err) {
        // The task is running; a failed status write must not undo that.
        log.error(`Task started for ${job.fileName} but status update failed: ${err.message}`);
      }
      dispatched++;
      log.log(`Transcoding job triggered successfully for: ${job.fileName}`);
    }

    return dispatched;
  }

  // Call exactly once per finished job (completed or failed), then refill the freed slot.
  async function onJobFinished() {
    await store.releaseSlot();
    return dispatchAvailable();
  }

  return { dispatchAvailable, onJobFinished };
}

module.exports = { createDispatcher };
