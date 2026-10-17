// Concurrency limits for the transcoding queue.
//
// WHY THESE NUMBERS (GPU mode, default g4dn.xlarge = 1x NVIDIA T4, 16 GB VRAM)
//
//   1. Scheduler:  ECS hands a GPU to exactly ONE task (resourceRequirements GPU=1 is exclusive), so with the
//                  shipped task definition a g4dn.xlarge runs 1 job at a time. JOBS_PER_GPU=1 reflects that.
//   2. Instances:  The ASG is capped at GPU_ASG_MAX_SIZE (keep equal to Terraform's asg_max_size). Jobs beyond
//                  instances x GPUs would only sit in ECS PROVISIONING waiting for an instance that is never
//                  coming, so they are kept in the Redis queue instead.
//   3. VRAM:       Only matters if you let several jobs share a GPU (JOBS_PER_GPU > 1, which needs a task
//                  definition that does not reserve the GPU). A 1080p decode + 4 scaled surfaces + 4 NVENC
//                  sessions is a few GB; GPU_MEMORY_PER_JOB_GIB=3 is an ESTIMATE -- measure with
//                  `nvidia-smi --query-gpu=memory.used --format=csv -l 1` during the benchmark.
//   4. NVENC:      Concurrent encodes are bounded by the dedicated hardware encoder and driver session limits,
//                  NOT by CUDA core count. A split-mode job opens 4 sessions (one per rung). The session cap
//                  for a T4 is not assumed here: leave NVENC_SESSIONS_PER_GPU unset (= unknown/unbounded) until
//                  the benchmark shows where throughput stops scaling or ffmpeg starts failing with
//                  "OpenEncodeSessionEx failed", then set it.
//
//   ceiling = GPU_ASG_MAX_SIZE x GPUS_PER_INSTANCE x min(JOBS_PER_GPU, vram bound, nvenc bound)
//
// MAX_CONCURRENT_JOBS may LOWER the limit freely but can never exceed the ceiling (it is clamped and a warning
// is logged), so a typo cannot queue more work than the hardware can run. In CPU mode there is no such
// ceiling (Fargate scales out), so the legacy default of 5 applies and MAX_CONCURRENT_JOBS is taken as-is.

const LEGACY_CPU_MAX_CONCURRENT_JOBS = 5;

function intFromEnv(env, name, fallback, { min = 1 } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`${name}="${raw}" must be an integer >= ${min}`);
  }
  return n;
}

function resolveLimiterConfig(env = process.env) {
  const mode = (env.TRANSCODE_MODE || "cpu").toLowerCase();
  const warnings = [];

  const leakIntervalMs = intFromEnv(env, "LEAK_INTERVAL_MS", 20000, { min: 1000 });
  const explicitMax = intFromEnv(env, "MAX_CONCURRENT_JOBS", undefined);
  let maxConcurrentJobs;
  let derived = null;

  if (mode === "gpu") {
    const instances = intFromEnv(env, "GPU_ASG_MAX_SIZE", 2);
    const gpusPerInstance = intFromEnv(env, "GPUS_PER_INSTANCE", 1);
    const jobsPerGpuRequested = intFromEnv(env, "JOBS_PER_GPU", 1);
    const gpuMemGiB = intFromEnv(env, "GPU_MEMORY_GIB", 16);
    const memPerJobGiB = intFromEnv(env, "GPU_MEMORY_PER_JOB_GIB", 3);
    const nvencSessionsPerGpu = intFromEnv(env, "NVENC_SESSIONS_PER_GPU", 0, { min: 0 }); // 0 = unknown
    const nvencSessionsPerJob = intFromEnv(env, "NVENC_SESSIONS_PER_JOB", 4);

    const byVram = Math.max(1, Math.floor((gpuMemGiB * 0.9) / memPerJobGiB)); // keep 10% headroom
    const byNvenc = nvencSessionsPerGpu > 0 ? Math.max(1, Math.floor(nvencSessionsPerGpu / nvencSessionsPerJob)) : Infinity;
    const jobsPerGpu = Math.min(jobsPerGpuRequested, byVram, byNvenc);
    const ceiling = instances * gpusPerInstance * jobsPerGpu;

    if (jobsPerGpu < jobsPerGpuRequested) {
      warnings.push(`JOBS_PER_GPU=${jobsPerGpuRequested} reduced to ${jobsPerGpu} (VRAM bound ${byVram}, NVENC bound ${byNvenc})`);
    }
    if (explicitMax !== undefined && explicitMax > ceiling) {
      warnings.push(`MAX_CONCURRENT_JOBS=${explicitMax} exceeds the hardware ceiling ${ceiling}; clamped`);
    }
    maxConcurrentJobs = explicitMax === undefined ? ceiling : Math.min(explicitMax, ceiling);
    derived = { instances, gpusPerInstance, jobsPerGpu, byVram, byNvenc: Number.isFinite(byNvenc) ? byNvenc : null, ceiling };
  } else {
    maxConcurrentJobs = explicitMax === undefined ? LEGACY_CPU_MAX_CONCURRENT_JOBS : explicitMax;
  }

  // Leak rate = how many queued jobs may be released per tick/event. Default: as many as there are free slots.
  const leakRate = intFromEnv(env, "LEAK_RATE", maxConcurrentJobs);

  return { mode, maxConcurrentJobs, leakRate, leakIntervalMs, derived, warnings };
}

module.exports = { resolveLimiterConfig, LEGACY_CPU_MAX_CONCURRENT_JOBS };
