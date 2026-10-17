const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const fsPromises = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const {
  markTaskProcessing,
  markTaskCompleted,
  markTaskFailed,
} = require("./utils/webhooks.js");
const { readConfig } = require("./utils/transcodeConfig.js");
const { probeSource } = require("./utils/probe.js");
const { transcodeWithFallback } = require("./utils/transcode.js");

// No explicit credentials: the SDK's default chain uses the ECS task role (GPU/EC2 path) and still honours
// AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY if the legacy Fargate path injects them.
const s3client = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });

const KEY = process.env.OBJECT_KEY;
const bucketName = process.env.TEMP_S3_BUCKET_NAME;
const finalBucketName = process.env.FINAL_S3_BUCKET_NAME;

const videoName = KEY.split("/").pop();
const originalFileName = videoName.split(".")[0]; // Remove file extension
// Each upload has its own output folder (the server passes "videos/<video id>"); the old per-file-name folder is only
// a fallback for jobs started by an older server.
const OUTPUT_PREFIX = (process.env.OUTPUT_PREFIX || `videos/${originalFileName}`).replace(/\/+$/, "");

async function uploadOutput(output) {
  console.log(`Uploading ${output.file} video to S3...`);
  await s3client.send(
    new PutObjectCommand({
      Bucket: finalBucketName,
      Key: `${OUTPUT_PREFIX}/${output.file}`,
      Body: fs.createReadStream(path.resolve(output.path)),
      ContentType: "video/mp4",
    })
  );
  console.log(`Uploaded ${output.name} video to S3`);
}

async function init() {
  try {
    const config = readConfig();
    console.log(`Transcode config: mode=${config.mode} strategy=${config.strategy} fallbackToCpu=${config.fallbackToCpu}`);

    await markTaskProcessing(KEY);

    const response = await s3client.send(new GetObjectCommand({ Bucket: bucketName, Key: KEY }));
    const originalFilePath = `original-video.mp4`;
    await fsPromises.writeFile(originalFilePath, response.Body);
    console.log("Downloaded the original video");
    const originalVideoPath = path.resolve(originalFilePath);

    const source = await probeSource(originalVideoPath);
    console.log(`Source: ${JSON.stringify(source)}`);

    const outputDir = process.cwd();
    const { modeUsed, job, seconds, fallbackReason } = await transcodeWithFallback({
      config,
      input: originalVideoPath,
      outputDir,
      baseName: originalFileName,
      source,
    });
    console.log(`Transcoded in ${seconds}s using ${modeUsed}${fallbackReason ? ` (fallback: ${fallbackReason})` : ""}`);

    // Upload every rung; clean up local files whatever happens.
    const results = await Promise.allSettled(
      job.outputs.map((o) =>
        uploadOutput(o).finally(() => fs.unlink(o.path, (err) => err && console.error(`Error deleting ${o.path}:`, err)))
      )
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.error(`${failed.length} uploads failed:`);
      failed.forEach((r, i) => console.error(` - Upload ${i + 1}: ${r.reason}`));
      await markTaskFailed(KEY);
      process.exit(1);
    }

    console.log("All uploads completed successfully!");
    const allFilesObject = {};
    job.outputs.forEach((o) => { allFilesObject[o.name] = o.file; });
    await markTaskCompleted(KEY, allFilesObject);
  } catch (err) {
    console.error(err);
    try {
      await markTaskFailed(KEY);
    } catch (_) {
      // already logged inside markTaskFailed
    }
    process.exit(1);
  }
}

init();
