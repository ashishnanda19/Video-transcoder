// download the original video
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const fsPromises = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const ffmpeg = require("fluent-ffmpeg");
const { spawn } = require("child_process");
// const { Worker } = require("node:worker_threads");
const { markTaskCompleted, markTaskFailed } = require("./utils/webhooks.js");

let allFiles = [];

const RESOLUTIONS = [
  { name: "360p", width: 480, height: 360 },
  { name: "480p", width: 858, height: 480 },
  { name: "720p", width: 1280, height: 720 },
  { name: "1080p", width: 1920, height: 1080 },
];

const s3client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// const BUCKET_NAME = process.env.BUCKET_NAME;
const KEY = process.env.OBJECT_KEY;
const bucketName = process.env.TEMP_S3_BUCKET_NAME;
const finalBucketName = process.env.FINAL_S3_BUCKET_NAME;

const videoName = KEY.split("/").pop();
const originalFileName = videoName.split(".")[0]; // Remove file extension

async function init() {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: KEY,
    });

    const response = await s3client.send(command);
    const originalFilePath = `original-video.mp4`;
    await fsPromises.writeFile(originalFilePath, response.Body);
    console.log("Downloaded the original video");
    const originalVideoPath = path.resolve(originalFilePath);

    /*
    // start transcoder
    const promises = RESOLUTIONS.map((resolution) => {
      const output = `${originalFileName}-${resolution.name}.mp4`;

      return new Promise((resolve, reject) => {
      
        ffmpeg(originalVideoPath)
          .output(output)
          .videoCodec("libx264")
          .audioCodec("aac")
          .size(`${resolution.width}x${resolution.height}`)
          .on("end", async () => {
            // upload the video to s3
            console.log(`Transcoded video to ${resolution.name}`);
            try {
              console.log("Uploading transcoded video to S3....");
              const putCommand = new PutObjectCommand({
                Bucket: finalBucketName,
                Key: `videos/${originalFileName}/${output}`,
                Body: fs.createReadStream(path.resolve(output)),
                ContentType: "video/mp4",
              });
              await s3client.send(putCommand);
              console.log("Uploaded transcoded video to S3");

              allFiles.push(output);

              resolve();
            } catch (uploadError) {
              console.error(
                "Error uploading transcoded video to S3:",
                uploadError
              );
              reject(uploadError);
            } finally {
              // Clean up the local transcoded video file
              fs.unlink(output, (err) => {
                if (err) console.error(`Error deleting file ${output}:`, err);
              });
            }
          })
          .format("mp4")
          .run();
      });
    });


    */

    // Process each resolution in parallel
    const promises = RESOLUTIONS.map((resolution) => {
      const output = `${originalFileName}-${resolution.name}.mp4`;
      return new Promise((resolve, reject) => {
        const ffmpegArgs = [
          "-i",
          originalVideoPath,
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-s",
          `${resolution.width}x${resolution.height}`,
          output,
        ];

        const transcodingProcess = spawn("ffmpeg", ffmpegArgs);

        // Capture ffmpeg's stderr for logging
        // transcodingProcess.stderr.on("data", (data) => {
        //   console.log(`Transcoding ${resolution.name}: ${data}`);
        // });

        transcodingProcess.on("error", (error) => {
          console.error(`Error transcoding ${resolution.name}:`, error);
          reject(error);
        });

        transcodingProcess.on("close", async (code) => {
          if (code === 0) {
            console.log(`Transcoding to ${resolution.name} completed.`);

            try {
              // Upload transcoded file to S3
              console.log(`Uploading ${output} video to S3...`);
              const putCommand = new PutObjectCommand({
                Bucket: finalBucketName,
                Key: `videos/${originalFileName}/${output}`,
                Body: fs.createReadStream(path.resolve(output)),
                ContentType: "video/mp4",
              });
              await s3client.send(putCommand);
              console.log(`Uploaded ${resolution.name} video to S3`);
              allFiles.push(output);
              resolve();
            } catch (uploadError) {
              console.error(`Error uploading ${resolution.name}:`, uploadError);
              reject(uploadError);
            } finally {
              // Clean up local transcoded video file
              fs.unlink(output, (err) => {
                if (err) console.error(`Error deleting file ${output}:`, err);
              });
            }
          } else {
            reject(
              new Error(
                `Transcoding ${resolution.name} failed with code ${code}`
              )
            );
          }
        });
      });
    });

    /*
    // Spawn workers for each resolution
    const promises = RESOLUTIONS.map((resolution) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker("./utils/transcodeWorker.js", {
          workerData: {
            originalVideoPath,
            resolution,
            output: `${originalFileName}-${resolution.name}.mp4`,
          },
        });

        worker.on("message", async (output) => {
          try {
            console.log(
              `Uploading transcoded video (${resolution.name}) to S3...`
            );
            // Ensure the file exists before uploading
            if (!fs.existsSync(output)) {
              throw new Error(`File ${output} does not exist.`);
            }

            const putCommand = new PutObjectCommand({
              Bucket: finalBucketName,
              Key: `videos/${originalFileName}/${output}`,
              Body: fs.createReadStream(path.resolve(output)),
              ContentType: "video/mp4",
            });
            await s3client.send(putCommand);
            console.log(`Uploaded ${output} to S3`);
            resolve(output);
          } catch (err) {
            reject(err);
          }
        });

        worker.on("error", (err) => reject(err));
        worker.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      });
    });
*/
    const results = await Promise.allSettled(promises);

    const allSuccessful = results.every(
      (result) => result.status === "fulfilled"
    );

    if (allSuccessful) {
      console.log("All uploads completed successfully!");

      let allFilesObject = {};

      allFiles.map((file) => {
        if (file.includes("360p")) {
          allFilesObject["360p"] = file;
        } else if (file.includes("480p")) {
          allFilesObject["480p"] = file;
        } else if (file.includes("720p")) {
          allFilesObject["720p"] = file;
        } else if (file.includes("1080p")) {
          allFilesObject["1080p"] = file;
        }
      });

      markTaskCompleted(KEY, allFilesObject);
    } else {
      const failedResults = results.filter(
        (result) => result.status === "rejected"
      );
      const numFailed = failedResults.length;

      if (numFailed === 1) {
        console.error(`One upload failed:`);
        console.error(failedResults[0].reason);
      } else if (numFailed > 1) {
        console.error(`${numFailed} uploads failed:`);
        failedResults.forEach((result, index) => {
          console.error(` - Upload ${index + 1}: ${result.reason}`);
        });
      } else {
        // This shouldn't happen unless the logic for result statuses is incomplete
        console.error(
          "Unexpected error: Uploads reported failures but results show no rejections."
        );
      }

      markTaskFailed(KEY);

      process.exit(1);
    }
  } catch (err) {
    console.error(err);
    markTaskFailed(KEY);
    process.exit(1);
  }
}

init();
