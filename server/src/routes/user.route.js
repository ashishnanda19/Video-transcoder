const express = require("express");
const passport = require("passport");
const {
  getCurrentUser,
  logoutUser,
} = require("../controllers/user.controller.js");
const { isAuthenticated } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/google-login",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/login",
  passport.authenticate("google", {
    successRedirect: `${process.env.FRONTEND_URL}/upload`,
    failureRedirect: `${process.env.FRONTEND_URL}/signin`,
  })
);

router.get("/current-user", isAuthenticated, getCurrentUser);
router.get("/logout", isAuthenticated, logoutUser);

module.exports = router;
