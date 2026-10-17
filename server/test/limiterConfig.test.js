const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveLimiterConfig } = require("../src/jobs/limiterConfig.js");

test("cpu mode keeps the legacy default of 5 and has no hardware ceiling", () => {
  const c = resolveLimiterConfig({});
  assert.equal(c.mode, "cpu");
  assert.equal(c.maxConcurrentJobs, 5);
  assert.equal(c.derived, null);
  assert.equal(resolveLimiterConfig({ MAX_CONCURRENT_JOBS: "20" }).maxConcurrentJobs, 20);
});

test("gpu defaults derive from hardware: 1 GPU per g4dn.xlarge x ASG max (2) = 2 concurrent jobs", () => {
  const c = resolveLimiterConfig({ TRANSCODE_MODE: "gpu" });
  assert.equal(c.maxConcurrentJobs, 2);
  assert.equal(c.derived.ceiling, 2);
  assert.equal(c.derived.jobsPerGpu, 1);
  assert.deepEqual(c.warnings, []);
});

test("the ceiling follows the ASG size", () => {
  assert.equal(resolveLimiterConfig({ TRANSCODE_MODE: "gpu", GPU_ASG_MAX_SIZE: "4" }).maxConcurrentJobs, 4);
});

test("MAX_CONCURRENT_JOBS can lower but never exceed the hardware ceiling", () => {
  assert.equal(resolveLimiterConfig({ TRANSCODE_MODE: "gpu", GPU_ASG_MAX_SIZE: "4", MAX_CONCURRENT_JOBS: "1" }).maxConcurrentJobs, 1);
  const c = resolveLimiterConfig({ TRANSCODE_MODE: "gpu", MAX_CONCURRENT_JOBS: "50" });
  assert.equal(c.maxConcurrentJobs, 2);
  assert.match(c.warnings.join(" "), /exceeds the hardware ceiling 2/);
});

test("sharing a GPU is bounded by VRAM (16 GB, 10% headroom, 3 GB/job => 4)", () => {
  const c = resolveLimiterConfig({ TRANSCODE_MODE: "gpu", JOBS_PER_GPU: "10" });
  assert.equal(c.derived.byVram, 4);
  assert.equal(c.derived.jobsPerGpu, 4);
  assert.equal(c.maxConcurrentJobs, 8); // 2 instances x 1 GPU x 4
  assert.match(c.warnings.join(" "), /JOBS_PER_GPU=10 reduced to 4/);
});

test("sharing a GPU is bounded by NVENC sessions when a session cap is configured", () => {
  const c = resolveLimiterConfig({ TRANSCODE_MODE: "gpu", JOBS_PER_GPU: "4", NVENC_SESSIONS_PER_GPU: "8", NVENC_SESSIONS_PER_JOB: "4" });
  assert.equal(c.derived.byNvenc, 2);
  assert.equal(c.derived.jobsPerGpu, 2);
  assert.equal(c.maxConcurrentJobs, 4);
});

test("an unknown NVENC cap is not invented", () => {
  assert.equal(resolveLimiterConfig({ TRANSCODE_MODE: "gpu" }).derived.byNvenc, null);
});

test("leak rate defaults to the concurrency limit and is configurable", () => {
  assert.equal(resolveLimiterConfig({ TRANSCODE_MODE: "gpu", GPU_ASG_MAX_SIZE: "3" }).leakRate, 3);
  const c = resolveLimiterConfig({ LEAK_RATE: "1", LEAK_INTERVAL_MS: "5000" });
  assert.equal(c.leakRate, 1);
  assert.equal(c.leakIntervalMs, 5000);
});

test("invalid values fail loudly instead of silently becoming NaN", () => {
  assert.throws(() => resolveLimiterConfig({ MAX_CONCURRENT_JOBS: "abc" }), /MAX_CONCURRENT_JOBS/);
  assert.throws(() => resolveLimiterConfig({ MAX_CONCURRENT_JOBS: "0" }), /MAX_CONCURRENT_JOBS/);
  assert.throws(() => resolveLimiterConfig({ LEAK_INTERVAL_MS: "10" }), /LEAK_INTERVAL_MS/);
});
