const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRunTaskInput, assertRunTaskSucceeded } = require("../src/utils/runTaskInput.js");

const job = { objectKey: "uploads/videos/a.mp4", fileName: "a" };
const gpuEnv = { TRANSCODE_MODE: "gpu", GPU_CLUSTER: "c", GPU_TASK: "t", GPU_CAPACITY_PROVIDER: "cp", MY_AWS_ACCESS_KEY_ID: "AKIA", MY_AWS_SECRET_ACCESS_KEY: "secret" };
const cpuEnv = { CLUSTER: "old", TASK: "old-task:3", ECS_SUBNETS: "s1,s2", ECS_SECURITY_GROUP: "sg", MY_AWS_ACCESS_KEY_ID: "AKIA", MY_AWS_SECRET_ACCESS_KEY: "secret" };
const envOf = (input) => Object.fromEntries(input.overrides.containerOverrides[0].environment.map((e) => [e.name, e.value]));

test("gpu mode uses the capacity provider, not Fargate or awsvpc", () => {
  const input = buildRunTaskInput(job, gpuEnv);
  assert.deepEqual(input.capacityProviderStrategy, [{ capacityProvider: "cp", weight: 1 }]);
  assert.equal(input.launchType, undefined, "launchType conflicts with capacityProviderStrategy");
  assert.equal(input.networkConfiguration, undefined);
  assert.equal(input.cluster, "c");
  assert.equal(input.taskDefinition, "t");
  assert.equal(input.overrides.containerOverrides[0].name, "video-transcoder");
});

test("gpu mode never ships AWS keys to the container (task role is used)", () => {
  const e = envOf(buildRunTaskInput(job, gpuEnv));
  assert.equal(e.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(e.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(e.TRANSCODE_MODE, "gpu");
  assert.equal(e.OBJECT_KEY, job.objectKey);
});

test("gpu mode requires its own cluster/task/capacity-provider settings", () => {
  assert.throws(() => buildRunTaskInput(job, { TRANSCODE_MODE: "gpu", GPU_CLUSTER: "c" }), /GPU_TASK/);
});

test("cpu mode (default) is the unchanged Fargate request", () => {
  const input = buildRunTaskInput(job, cpuEnv);
  assert.equal(input.launchType, "FARGATE");
  assert.equal(input.cluster, "old");
  assert.deepEqual(input.networkConfiguration.awsvpcConfiguration.subnets, ["s1", "s2"]);
  assert.equal(input.capacityProviderStrategy, undefined);
  assert.equal(envOf(input).TRANSCODE_MODE, "cpu");
});

test("cpu mode still validates Fargate networking", () => {
  assert.throws(() => buildRunTaskInput(job, { CLUSTER: "x", TASK: "y" }), /ECS_SUBNETS/);
});

test("tuning env vars set on the server are forwarded to the container", () => {
  const e = envOf(buildRunTaskInput(job, { ...gpuEnv, TRANSCODE_STRATEGY: "separate", GPU_CODEC: "hevc" }));
  assert.equal(e.TRANSCODE_STRATEGY, "separate");
  assert.equal(e.GPU_CODEC, "hevc");
  assert.equal(e.NVENC_CQ, undefined, "unset knobs are not forwarded");
});

test("RunTask `failures` (which do not throw) are surfaced as errors", () => {
  assert.throws(() => assertRunTaskSucceeded({ tasks: [], failures: [{ reason: "RESOURCE:GPU", detail: "no GPU" }] }), /RESOURCE:GPU.*no GPU/);
  assert.throws(() => assertRunTaskSucceeded({ tasks: [], failures: [] }), /no task returned/);
  assert.deepEqual(assertRunTaskSucceeded({ tasks: [{ taskArn: "arn:t" }], failures: [] }), { taskArn: "arn:t" });
});
