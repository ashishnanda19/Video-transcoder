const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  // No static keys configured -> the SDK default chain (the ECS task role in production, AWS_PROFILE locally).
  ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
});

const tempBucket = () => process.env.TEMP_S3_BUCKET_NAME || "video-transcoder-temp-ashish";
const finalBucket = () => process.env.FINAL_S3_BUCKET_NAME || "video-transcoder-final-ashish";

// Presigned upload. ContentLength is part of the signature, so S3 rejects a body that is not exactly the size the
// server already validated: the client cannot claim 1 MB and upload 5 GB.
async function putObjectURL({ key, contentType, size, expiresIn = 300 }) {
  const command = new PutObjectCommand({ Bucket: tempBucket(), Key: key, ContentType: contentType, ContentLength: size });
  return getSignedUrl(s3Client, command, { expiresIn });
}

// Signed download/stream URL for a rendition. `downloadName` forces a save-as with that file name.
async function getObjectURL(key, { downloadName, expiresIn = 900 } = {}) {
  const command = new GetObjectCommand({
    Bucket: finalBucket(),
    Key: key,
    ...(downloadName
      ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` }
      : {}),
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

async function deleteObjectFile(key) {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: tempBucket(), Key: key }));
    console.log("File successfully deleted from TEMP_S3_BUCKET");
  } catch (error) {
    console.log("Error occurred while deleting the object file: ", error);
  }
}

module.exports = { putObjectURL, getObjectURL, deleteObjectFile };
