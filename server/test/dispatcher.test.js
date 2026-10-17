const test = require("node:test");
const assert = require("node:assert/strict");
const { createDispatcher } = require("../src/jobs/dispatcher.js");

const silent = { log() {}, error() {} };

// In-memory stand-in for the Redis store. acquireSlot is check-and-increment in one synchronous step,
// which is the same atomicity guarantee the Lua script gives in Redis.
function fakeStore(jobs = []) {
  const s = {
    running: 0,
    queue: [...jobs], // index 0 = next to dequeue (RPOP end)
    async acquireSlot(max) {
      if (s.running < max) { s.running++; return true; }
      return false;
    },
    async releaseSlot() { if (s.running > 0) s.running--; },
    async dequeue() { return s.queue.shift() || null; },
    async requeueFront(job) { s.queue.unshift(job); },
  };
  return s;
}
const jobs = (n) => Array.from({ length: n }, (_, i) => ({ fileName: `v${i}`, objectKey: `k${i}` }));
const cfg = (over = {}) => ({ maxConcurrentJobs: 2, leakRate: 2, ...over });

function setup({ n = 5, config = cfg(), trigger } = {}) {
  const store = fakeStore(jobs(n));
  const started = [];
  const marked = [];
  const d = createDispatcher({
    store,
    config,
    log: silent,
    trigger: trigger || (async (job) => { started.push(job.fileName); }),
    markStarting: async (job) => { marked.push(job.fileName); },
  });
  return { store, started, marked, ...d };
}

test("never runs more than maxConcurrentJobs; the rest wait in the queue (not dropped)", async () => {
  const t = setup({ n: 5 });
  assert.equal(await t.dispatchAvailable(), 2);
  assert.deepEqual(t.started, ["v0", "v1"]);
  assert.equal(t.store.queue.length, 3);
  assert.equal(await t.dispatchAvailable(), 0, "full: nothing more is released, even on repeated polls");
  assert.equal(t.store.queue.length, 3);
});

test("slots stay held while tasks are STARTING (ASG scaling from zero), so later jobs keep waiting", async () => {
  // Trigger resolves immediately (RunTask accepted, task PROVISIONING) but no webhook has arrived yet.
  const t = setup({ n: 4, config: cfg({ maxConcurrentJobs: 1, leakRate: 5 }) });
  await t.dispatchAvailable();
  await t.dispatchAvailable();
  await t.dispatchAvailable();
  assert.deepEqual(t.started, ["v0"]);
  assert.equal(t.store.queue.length, 3);
});

test("a finished job releases exactly one slot and starts the next queued job (FIFO)", async () => {
  const t = setup({ n: 4, config: cfg({ maxConcurrentJobs: 1, leakRate: 5 }) });
  await t.dispatchAvailable();
  assert.equal(await t.onJobFinished(), 1);
  assert.deepEqual(t.started, ["v0", "v1"]);
  assert.equal(t.store.running, 1);
});

test("leak rate caps how many jobs are released per call", async () => {
  const t = setup({ n: 10, config: cfg({ maxConcurrentJobs: 8, leakRate: 3 }) });
  assert.equal(await t.dispatchAvailable(), 3);
  assert.equal(await t.dispatchAvailable(), 3);
  assert.equal(t.store.running, 6);
});

test("a failed RunTask neither loses the job nor leaks the slot; order is preserved", async () => {
  let fail = true;
  const t = setup({
    n: 3,
    trigger: async (job) => { if (fail) throw new Error("ECS throttled"); t.started.push(job.fileName); },
  });
  assert.equal(await t.dispatchAvailable(), 0);
  assert.equal(t.store.running, 0, "slot released");
  assert.deepEqual(t.store.queue.map((j) => j.fileName), ["v0", "v1", "v2"], "job back at the FRONT, nothing lost");
  fail = false;
  await t.dispatchAvailable();
  assert.deepEqual(t.started, ["v0", "v1"], "retried in original order");
});

test("an empty queue returns the slot it speculatively took", async () => {
  const t = setup({ n: 0 });
  assert.equal(await t.dispatchAvailable(), 0);
  assert.equal(t.store.running, 0);
});

test("concurrent dispatch calls (poll loop + webhook) cannot overshoot the limit", async () => {
  const t = setup({ n: 20, config: cfg({ maxConcurrentJobs: 3, leakRate: 20 }) });
  await Promise.all(Array.from({ length: 6 }, () => t.dispatchAvailable()));
  assert.equal(t.started.length, 3);
  assert.equal(new Set(t.started).size, 3, "no job started twice");
  assert.equal(t.store.running, 3);
});

test("marks each dispatched job STARTING, and a status-write failure does not undo the launch", async () => {
  const t = setup({ n: 2 });
  await t.dispatchAvailable();
  assert.deepEqual(t.marked, ["v0", "v1"]);

  const store = fakeStore(jobs(1));
  const started = [];
  const d = createDispatcher({
    store, config: cfg(), log: silent,
    trigger: async (j) => started.push(j.fileName),
    markStarting: async () => { throw new Error("mongo down"); },
  });
  assert.equal(await d.dispatchAvailable(), 1);
  assert.equal(store.running, 1, "task is running, slot stays taken");
  assert.equal(store.queue.length, 0);
});

test("duplicate completion events cannot drive the counter negative", async () => {
  const t = setup({ n: 0 });
  await t.onJobFinished();
  await t.onJobFinished();
  assert.equal(t.store.running, 0);
});
