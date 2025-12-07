const { ApiResponse } = require("../utils/ApiResponse.js");
const { putObjectURL, getObjectURL } = require("../utils/s3SignedUrl.js");

const uploadToTempBucketURL = async (req, res) => {
  const { fileName, contentType } = req.query;

  const bucketName = process.env.TEMP_S3_BUCKET_NAME;

  const url = await putObjectURL(fileName, contentType, bucketName);

  if (!url) {
    return res
      .status(500)
      .json(new ApiResponse(500, {}, "Error while generating the signed URL"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, url, "Signed URL generated successfully"));
};

const getFinalBucketvideoURL = async (req,res) => {
  const { fileName, videoUrl } = req.query;

  const key = `videos/${fileName}/${videoUrl}`;
  const bucketName = process.env.FINAL_S3_BUCKET_NAME;

  const url = await getObjectURL(key, bucketName);
  if (!url) {
    return res
      .status(500)
      .json(new ApiResponse(500, {}, "Error while generating the signed URL"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, url, "Signed URL generated successfully"));
};

module.exports = {
  uploadToTempBucketURL,
  getFinalBucketvideoURL,
};
