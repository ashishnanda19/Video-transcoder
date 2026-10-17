// Pure RunTask construction/validation -- no AWS SDK import, so it is unit-testable offline.
// TRANSCODE_MODE=gpu -> ECS on EC2 GPU instances via a capacity provider (scale-from-zero ASG)
// TRANSCODE_MODE=cpu -> the original Fargate path. This single flag is the rollback switch.
const getMode = (env = process.env) => (env.TRANSCODE_MODE || "cpu").toLowerCase();

// Transcode tuning knobs forwarded verbatim to the container when set on the server.
const PASSTHROUGH_ENV = [
  "TRANSCODE_STRATEGY",
  "GPU_FALLBACK_TO_CPU",
  "GPU_CODEC",
  "GPU_SCALER",
  "NVENC_PRESET",
  "NVENC_TUNE",
  "NVENC_CQ",
  "LADDER_KBPS",
  "AUDIO_MODE",
  "AUDIO_BITRATE",
];

// Pure: env + job -> RunTask input, so the GPU/CPU shapes are unit-testable without AWS.
function buildRunTaskInput(job, env = process.env) {
  const mode = getMode(env);
  const tempBucket = env.TEMP_S3_BUCKET_NAME || "video-transcoder-temp-ashish";
  const finalBucket = env.FINAL_S3_BUCKET_NAME || "video-transcoder-final-ashish";

  const environment = [
    { name: "OBJECT_KEY", value: job.objectKey },
    { name: "KEY", value: job.objectKey }, // Alias for older code
    { name: "TEMP_S3_BUCKET_NAME", value: tempBucket },
    { name: "BUCKET", value: tempBucket }, // Alias for older code
    { name: "FINAL_S3_BUCKET_NAME", value: finalBucket },
    // Must be reachable FROM AWS (a public URL or tunnel). Omitted when unset: the worker then skips callbacks.
    ...(env.WEBHOOK_URL ? [{ name: "WEBHOOK_URL", value: env.WEBHOOK_URL }] : []),
    { name: "TRANSCODE_MODE", value: mode },
    ...PASSTHROUGH_ENV.filter((n) => env[n]).map((n) => ({ name: n, value: env[n] })),
  ];

  const overrides = { containerOverrides: [{ name: "video-transcoder", environment }] };

  if (mode === "gpu") {
    if (!env.GPU_CLUSTER || !env.GPU_TASK || !env.GPU_CAPACITY_PROVIDER) {
      throw new Error("GPU_CLUSTER, GPU_TASK and GPU_CAPACITY_PROVIDER must be set when TRANSCODE_MODE=gpu.");
    }
    // No launchType (it conflicts with capacityProviderStrategy), no awsvpc network config (tasks use bridge
    // networking on the instance) and no AWS keys: the S3 access comes from the ECS task role.
    // With managed scaling the task sits in PROVISIONING while the ASG scales 0 -> 1.
    return {
      cluster: env.GPU_CLUSTER,
      taskDefinition: env.GPU_TASK,
      capacityProviderStrategy: [{ capacityProvider: env.GPU_CAPACITY_PROVIDER, weight: 1 }],
      count: 1,
      startedBy: "vidflow-server",
      overrides,
    };
  }

  const subnets = (env.ECS_SUBNETS || "").split(",").filter(Boolean);
  if (!subnets.length || !env.ECS_SECURITY_GROUP) {
    throw new Error("ECS_SUBNETS and ECS_SECURITY_GROUP environment variables must be set.");
  }
  // No AWS keys injected any more: the Fargate task definition carries the same S3 task role as the GPU one.
  return {
    cluster: env.CLUSTER,
    taskDefinition: env.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets,
        securityGroups: [env.ECS_SECURITY_GROUP],
      },
    },
    overrides,
  };
}

// RunTask reports placement problems in `failures` WITHOUT throwing; treating that as success would leave a
// job marked as started with no task behind it.
function assertRunTaskSucceeded(response) {
  const failures = response.failures || [];
  if (failures.length || !(response.tasks || []).length) {
    const detail = failures.map((f) => `${f.reason}${f.detail ? `: ${f.detail}` : ""}`).join("; ") || "no task returned";
    throw new Error(`ECS RunTask failed: ${detail}`);
  }
  return { taskArn: response.tasks[0].taskArn };
}

module.exports = { buildRunTaskInput, assertRunTaskSucceeded, getMode, PASSTHROUGH_ENV };
