const { parentPort, workerData } = require("node:worker_threads");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('node:fs');

const { originalVideoPath, resolution, output } = workerData;

// Start transcoding with ffmpeg
ffmpeg(originalVideoPath)
  .output(output)
  .videoCodec("libx264")
  .audioCodec("aac")
  .size(`${resolution.width}x${resolution.height}`)
  .on('end', () => {
    console.log(`Transcoded to ${resolution.name}`);
    parentPort.postMessage(output);
  })
  .on('error', (err) => {
    console.error(`Error transcoding ${resolution.name}:`, err);
    parentPort.postMessage({ error: err });
  })
  .format('mp4')
  .run();
