const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { buildRunTaskInput, assertRunTaskSucceeded, getMode } = require("./runTaskInput.js");

const region = process.env.AWS_REGION || "ap-south-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;

const ecsClient = new ECSClient({
  region,
  // Fall back to the SDK's default chain (instance/task role, SSO, ...) when no static keys are configured.
  ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
});

const triggerTranscodingJob = async (job) => {
  try {
    const input = buildRunTaskInput(job);
    return assertRunTaskSucceeded(await ecsClient.send(new RunTaskCommand(input)));
  } catch (error) {
    console.error("An error occurred while triggering transcoding job:");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    if (error.$metadata) console.error("Metadata:", error.$metadata);
    throw error;
  }
};

module.exports = { triggerTranscodingJob, buildRunTaskInput, assertRunTaskSucceeded, getMode };
