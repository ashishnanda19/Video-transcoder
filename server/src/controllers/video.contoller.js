const mongoose = require("mongoose");
const Video = require("../models/video.model.js");
const { ApiError } = require("../utils/ApiError.js");
const { ApiResponse } = require("../utils/ApiResponse.js");
const { asyncHandler } = require("../utils/asyncHandler.js");
const { VIDEO_PROCESS_STATES } = require("../constants.js");
const { loadConfig } = require("../config.js");
const { putObjectURL, getObjectURL, deleteObjectFile, deleteFinalPrefix } = require("../utils/s3SignedUrl.js");
const { isDeletable, outputPrefixOf } = require("../utils/videoLifecycle.js");
const {
  validateUploadRequest,
  buildUploadKey,
  buildOutputPrefix,
  titleFromFileName,
  sanitizeFileName,
  MAX_UPLOAD_BYTES,
} = require("../utils/uploadKey.js");

const config = loadConfig();
const RUNGS = ["1080p", "720p", "480p", "360p"];
const STATUSES = Object.values(VIDEO_PROCESS_STATES);
const IN_FLIGHT = [VIDEO_PROCESS_STATES.QUEUED, VIDEO_PROCESS_STATES.STARTING, VIDEO_PROCESS_STATES.PROCESSING];
const PENDING_GRACE_MS = 15 * 60 * 1000; // an upload link that was never used stops counting/showing after this
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every video route is scoped to the signed-in user. A record that belongs to someone else is reported as "not found",
// so ids cannot be used to discover other people's uploads.
const ownedVideo = async (req, id) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "invalid video id");
  const video = await Video.findOne({ _id: id, owner: req.user._id });
  if (!video) throw new ApiError(404, "Video not found!");
  return video;
};

// Step 1 of an upload: the server validates the request, creates the record (owner, unique key) and hands back a
// short-lived signed URL bound to exactly this size and type.
const createUpload = asyncHandler(async (req, res) => {
  const invalid = validateUploadRequest(req.body || {});
  if (invalid) throw new ApiError(400, invalid);

  const owner = req.user._id;
  const { fileName, contentType } = req.body;
  const size = Number(req.body.size);

  const [active, today, serviceToday] = await Promise.all([
    Video.countDocuments({
      owner,
      $or: [
        { progress: { $in: IN_FLIGHT } },
        { progress: VIDEO_PROCESS_STATES.PENDING, createdAt: { $gt: new Date(Date.now() - PENDING_GRACE_MS) } },
      ],
    }),
    Video.countDocuments({ owner, createdAt: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } }),
    Video.countDocuments({ createdAt: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } }),
  ]);
  if (serviceToday >= config.limits.uploadsPerDayGlobal) {
    // The whole service has a daily budget (it runs on prepaid cloud credits). Say so plainly.
    throw new ApiError(429, "VidFlow has reached its daily upload capacity. Please try again tomorrow.");
  }
  if (active >= config.limits.maxActiveJobsPerUser) {
    throw new ApiError(429, `You already have ${active} videos in progress. Wait for one to finish, then try again.`);
  }
  if (today >= config.limits.uploadsPerUserPerDay) {
    throw new ApiError(429, `Daily upload limit reached (${config.limits.uploadsPerUserPerDay}). Try again tomorrow.`);
  }

  const video = new Video({
    owner,
    fileName: titleFromFileName(fileName),
    originalName: sanitizeFileName(fileName),
    sizeBytes: size,
    progress: VIDEO_PROCESS_STATES.PENDING,
  });
  video.objectKey = buildUploadKey({ videoId: video._id, fileName });
  video.outputPrefix = buildOutputPrefix(video._id);
  await video.save();

  const uploadUrl = await putObjectURL({ key: video.objectKey, contentType, size });
  return res.status(201).json(new ApiResponse(201, { videoId: video._id, uploadUrl, expiresIn: 300 }, "Upload URL created"));
});

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, query, sortBy, sortType, status } = req.query;
  const pageNo = Math.max(1, parseInt(page) || 1);
  const limitNo = Math.min(100, Math.max(1, parseInt(limit) || 20));
  // Default stays "completed only"; the library UI passes status=all.
  const statusFilter = status === "all" ? null : STATUSES.includes(status) ? status : VIDEO_PROCESS_STATES.COMPLETED;

  const filter = {
    owner: req.user._id,
    // hide upload links that were requested but never used
    $or: [{ progress: { $ne: VIDEO_PROCESS_STATES.PENDING } }, { createdAt: { $gt: new Date(Date.now() - PENDING_GRACE_MS) } }],
  };
  if (statusFilter) filter.progress = statusFilter;
  if (query) filter.fileName = { $regex: escapeRegex(query), $options: "i" };

  const sortField = ["createdAt", "fileName"].includes(sortBy) ? sortBy : "createdAt";
  const videos = await Video.find(filter)
    .sort({ [sortField]: sortType === "asc" ? 1 : -1 })
    .skip((pageNo - 1) * limitNo)
    .limit(limitNo)
    .select("fileName videoResolutions objectKey type progress outputPrefix createdAt updatedAt")
    .lean();

  return res.status(200).json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const video = await ownedVideo(req, req.params.videoId);
  return res.status(200).json(new ApiResponse(200, video, "video fetched successfully"));
});

const getVideoByFileName = asyncHandler(async (req, res) => {
  const { fileName } = req.params;
  if (!fileName) throw new ApiError(400, "video fileName is required!");
  // Several uploads can share a title; show the most recent one.
  const video = await Video.findOne({ fileName, owner: req.user._id }).sort({ createdAt: -1 });
  if (!video) throw new ApiError(404, "Video not found!");
  return res.status(200).json(new ApiResponse(200, video, "video fetched successfully"));
});

const getVideoStatus = asyncHandler(async (req, res) => {
  const video = await ownedVideo(req, req.params.videoId);
  return res.status(200).json(new ApiResponse(200, { _id: video._id, progress: video.progress }, "video status fetched successfully!"));
});

// Signed URL for one rendition (stream it, or ?download=1 to save it). Short-lived: fetch when needed.
const getRenditionUrl = asyncHandler(async (req, res) => {
  const { videoId, rung } = req.params;
  if (!RUNGS.includes(rung)) throw new ApiError(400, "unknown rendition");
  const video = await ownedVideo(req, videoId);
  const file = video.videoResolutions && video.videoResolutions[rung];
  if (video.progress !== VIDEO_PROCESS_STATES.COMPLETED || !file) throw new ApiError(404, "That rendition is not available yet");

  const prefix = outputPrefixOf(video); // records from before unique prefixes fall back to the title
  const url = await getObjectURL(`${prefix}/${file}`, {
    downloadName: req.query.download ? `${video.fileName}-${rung}.mp4` : undefined,
  });
  return res.status(200).json(new ApiResponse(200, url, "Signed URL generated successfully"));
});

// Removes a video completely: its renditions, any leftover source upload, and the record. Owner only.
async function removeVideoAssets(video) {
  const removed = await deleteFinalPrefix(outputPrefixOf(video)).catch((e) => {
    if (/suspicious prefix/.test(e.message)) return 0; // legacy/odd record: nothing safe to delete
    throw e;
  });
  if (video.objectKey) await deleteObjectFile(video.objectKey); // already gone for finished jobs; harmless
  return removed;
}

const deleteVideo = asyncHandler(async (req, res) => {
  const video = await ownedVideo(req, req.params.videoId);
  if (!isDeletable(video.progress)) {
    throw new ApiError(409, "This video is still being processed. You can delete it once it has finished.");
  }
  await removeVideoAssets(video);
  await Video.deleteOne({ _id: video._id, owner: req.user._id });
  return res.status(200).json(new ApiResponse(200, {}, "Video deleted"));
});

// Public, non-secret facts the UI shows (limits, retention) so the text never disagrees with the server.
const getPublicConfig = (req, res) =>
  res.status(200).json(
    new ApiResponse(
      200,
      {
        maxUploadMb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
        retentionDays: config.retentionDays,
        dailyUploadsPerUser: config.limits.uploadsPerUserPerDay,
        // "gpu" only while jobs really run on NVIDIA GPUs (TRANSCODE_MODE=gpu); the UI words its claims from this.
        acceleration: (process.env.TRANSCODE_MODE || "cpu").toLowerCase() === "gpu" ? "gpu" : "cpu",
      },
      "ok"
    )
  );

module.exports = { createUpload, getAllVideos, getVideoById, getVideoByFileName, getVideoStatus, getRenditionUrl, deleteVideo, removeVideoAssets, getPublicConfig };
