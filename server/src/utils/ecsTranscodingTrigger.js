const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
  },
});

const config = {
  CLUSTER: process.env.CLUSTER,
  TASK: process.env.TASK,
  // VPC networking — set these after creating your ECS cluster
  SUBNETS: (process.env.ECS_SUBNETS || "").split(",").filter(Boolean),
  SECURITY_GROUP: process.env.ECS_SECURITY_GROUP,
};

const triggerTranscodingJob = async (job) => {
  try {
    if (!config.SUBNETS.length || !config.SECURITY_GROUP) {
      throw new Error(
        "ECS_SUBNETS and ECS_SECURITY_GROUP environment variables must be set."
      );
    }

    const command = new RunTaskCommand({
      cluster: config.CLUSTER,
      taskDefinition: config.TASK,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: config.SUBNETS,
          securityGroups: [config.SECURITY_GROUP],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "video-transcoder",
            environment: [
              { name: "OBJECT_KEY", value: job.objectKey },
              {
                name: "TEMP_S3_BUCKET_NAME",
                value: process.env.TEMP_S3_BUCKET_NAME,
              },
              {
                name: "FINAL_S3_BUCKET_NAME",
                value: process.env.FINAL_S3_BUCKET_NAME,
              },
              {
                name: "AWS_ACCESS_KEY_ID",
                value: process.env.MY_AWS_ACCESS_KEY_ID,
              },
              {
                name: "AWS_SECRET_ACCESS_KEY",
                value: process.env.MY_AWS_SECRET_ACCESS_KEY,
              },
              { name: "WEBHOOK_URL", value: process.env.WEBHOOK_URL },
            ],
          },
        ],
      },
    });

    await ecsClient.send(command);
  } catch (error) {
    console.error("An error occurred while triggering transcoding job:", error);
    throw error;
  }
};

module.exports = { triggerTranscodingJob };
