const mongoose = require("mongoose");
const Video = require("../models/video.model.js");
const { ApiError } = require("../utils/ApiError.js");
const { ApiResponse } = require("../utils/ApiResponse.js");
const { asyncHandler } = require("../utils/asyncHandler.js");

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
  const pageNo = parseInt(page);
  const limitNo = parseInt(limit);

  const aggregationPipeline = [];

  // Match stage for userId if provided
  if (userId) {
    aggregationPipeline.push({
      $match: {
        owner: mongoose.Types.ObjectId(userId),
        progress: "completed", // Considering only completed videos
      },
    });
  } else {
    aggregationPipeline.push({
      $match: {
        progress: "completed", // Considering only completed videos
      },
    });
  }

  // Search stage if query is provided
  if (query) {
    aggregationPipeline.push({
      $match: {
        $or: [
          { fileName: { $regex: query, $options: "i" } }, // Case-insensitive search for fileName
          { thumbnailUrl: { $regex: query, $options: "i" } }, // Case-insensitive search for thumbnailUrl
        ],
      },
    });
  }

  // Sorting stage
  const sortStage = {};
  if (sortBy && sortType) {
    sortStage["$sort"] = {
      [sortBy]: sortType === "asc" ? 1 : -1,
    };
  } else {
    sortStage["$sort"] = { createdAt: -1 };
  }
  aggregationPipeline.push(sortStage);

  // Pagination
  aggregationPipeline.push({ $skip: (pageNo - 1) * limitNo });
  aggregationPipeline.push({ $limit: limitNo });

  // Projecting fields
  aggregationPipeline.push({
    $project: {
      fileName: 1,
      videoResolutions: 1,
      objectKey: 1,
      thumbnailUrl: 1,
      type: 1,
      owner: 1,
      progress: 1,
      createdAt: 1,
      // Add other fields as needed
    },
  });

  const videos = await Video.aggregate(aggregationPipeline);

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const getVideoByFileName = asyncHandler(async (req, res) => {
  const { fileName } = req.params;
  //TODO: get video by id

  if (!fileName) {
    throw new ApiError(400, "video fileName is required!");
  }

  const video = await Video.findOne({ fileName });

  if (!video) {
    throw new ApiError(404, "Video not found!");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "video fetched successfully"));
});

const getVideoStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!videoId) {
    throw new ApiError(400, "videoId is required!");
  }

  const video = await Video.findById(videoId).select("progress");

  if (!video) {
    throw new ApiError(404, "Video not found!");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "video status fetched successfully!"));
});

module.exports = { getAllVideos, getVideoByFileName, getVideoStatus };
