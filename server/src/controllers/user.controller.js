const { asyncHandler } = require("../utils/asyncHandler.js");
const { ApiError } = require("../utils/ApiError.js");
const { ApiResponse } = require("../utils/ApiResponse.js");


const logoutUser = asyncHandler(async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      throw new ApiError(400, "All fields are required");
    }
  });

  return res
    .status(200)
    .clearCookie("connect.sid", {
      secure: true,
      httpOnly: true,
      sameSite: "none",
    })
    .json(new ApiResponse(200, {}, "Logged out Successfull"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

module.exports = {
  logoutUser,
  getCurrentUser,
};
