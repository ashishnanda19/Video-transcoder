const User = require("../models/user.model.js");
const { ApiError } = require("../utils/ApiError.js");
const { asyncHandler } = require("../utils/asyncHandler.js");

// Local development only: AUTH_DISABLED=true skips Google login so the app can run on localhost without OAuth keys.
// Refused in production so it can never be switched on by accident on a deployed server.
const LOCAL_DEV_USER = {
  displayName: "Local Dev",
  googleId: "local-dev",
  email: "local-dev@localhost",
  avatar: "https://github.com/shadcn.png",
};
const authDisabled = () => process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

const isAuthenticated = asyncHandler(async (req, _, next) => {
  if (authDisabled()) {
    req.user = LOCAL_DEV_USER;
    return next();
  }
  try {
    // const token =
    //   req.cookies?.accessToken ||
    //   req.header("Authorization")?.replace("Bearer ", "");

    console.log(req.cookies);
    const token = req.cookies["connect.sid"];
    console.log(token);

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Token");
  }
});

module.exports = {
  isAuthenticated,
  authDisabled,
};
