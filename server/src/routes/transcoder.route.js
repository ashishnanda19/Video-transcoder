const { Router } = require("express");
const { handleS3Trigger, handleECSTrigger } = require("../controllers/transcoder.controller.js");
const {
  createUpload,
  getAllVideos,
  getVideoByFileName,
  getVideoById,
  getVideoStatus,
  getRenditionUrl,
} = require("../controllers/video.contoller.js");
const { isAuthenticated, requireWebhookSecret } = require("../middlewares/auth.middleware.js");

const router = Router();

// server-to-server (authenticated by secret / per-job token, not by a user session)
router.post("/s3-trigger", requireWebhookSecret, handleS3Trigger);
router.post("/ecs-trigger", handleECSTrigger);

// signed-in users only, and always scoped to their own videos
router.post("/uploads", isAuthenticated, createUpload);
router.get("/get-all-videos", isAuthenticated, getAllVideos);
router.get("/id/:videoId", isAuthenticated, getVideoById);
router.get("/id/:videoId/rendition/:rung", isAuthenticated, getRenditionUrl);
router.get("/v/:fileName", isAuthenticated, getVideoByFileName);
router.get("/s/:videoId", isAuthenticated, getVideoStatus);

module.exports = router;
