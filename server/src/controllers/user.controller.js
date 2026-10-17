const { asyncHandler } = require("../utils/asyncHandler.js");
const { ApiResponse } = require("../utils/ApiResponse.js");

const SESSION_COOKIE = "vidflow.sid";

// Only what the UI needs; never the internal ids or provider ids.
const getCurrentUser = asyncHandler(async (req, res) => {
  const { displayName, email, avatar } = req.user;
  return res.status(200).json(new ApiResponse(200, { displayName, email, avatar }, "User fetched successfully"));
});

// POST (not GET) so a third-party page cannot log users out with an <img> tag; also destroys the server-side session.
const logoutUser = (req, res, next) => {
  const finish = () => {
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE);
      res.status(200).json(new ApiResponse(200, {}, "Logged out successfully"));
    });
  };
  if (typeof req.logout === "function") req.logout((err) => (err ? next(err) : finish()));
  else finish();
};

module.exports = { getCurrentUser, logoutUser, SESSION_COOKIE };
