const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const accessKeyId = process.env.MY_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.MY_AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function getObjectURL(key, bucketName) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command);
    return url;
  } catch (error) {
    console.log("Error ocuur while generating the getObjectURL: ", error);
  }
}

async function putObjectURL(fileName, contentType, bucketName) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: `uploads/videos/${fileName}`,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 180 });
    return url;
  } catch (error) {
    console.log("Error ocuur while generating the putObjectURL: ", error);
  }
}

async function deleteObjectFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.TEMP_S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log("File successfully deleted from TEMP_S3_BUCKET");
  } catch (error) {
    console.log("Error ocuur while deleting the object file: ", error);
  }
}

module.exports = { getObjectURL, putObjectURL, deleteObjectFile };
