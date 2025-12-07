const { Router } = require("express");
const {
  handleS3Trigger,
  handleECSTrigger,
} = require("../controllers/transcoder.controller.js");
const {
  getAllVideos,
  getVideoByFileName,
  getVideoStatus,
} = require("../controllers/video.contoller.js");
const {
  getFinalBucketvideoURL,
  uploadToTempBucketURL,
} = require("../controllers/s3.controlllers.js");
const { isAuthenticated } = require("../middlewares/auth.middleware.js");

const router = Router();

router.post("/s3-trigger", handleS3Trigger);
router.post("/ecs-trigger", handleECSTrigger);

router.get("/get-upload-url",isAuthenticated, uploadToTempBucketURL);
router.get("/get-video-urls",isAuthenticated, getFinalBucketvideoURL);

router.get("/get-all-videos", isAuthenticated, getAllVideos);
router.get("/v/:fileName",isAuthenticated, getVideoByFileName);
router.get("/s/:videoId",isAuthenticated, getVideoStatus);

module.exports = router;
