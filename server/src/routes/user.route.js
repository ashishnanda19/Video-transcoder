const express = require("express");
const passport = require("passport");
const { getCurrentUser, logoutUser } = require("../controllers/user.controller.js");
const { isAuthenticated, authDisabled } = require("../middlewares/auth.middleware.js");
const { loadConfig } = require("../config.js");

const router = express.Router();
const config = loadConfig();

// In local development the UI runs on another port, so redirects need its absolute address; in production the UI and
// API share one origin and relative paths are right.
const to = (path) => `${config.frontendUrl}${path}`;

if (authDisabled()) {
  // Local development (AUTH_DISABLED=true): there is no Google strategy; sign-in just lands you in the app.
  router.get(["/google", "/google-login", "/login"], (req, res) => res.redirect(to("/upload")));
} else {
  // 1) the UI sends the browser here; we redirect to Google (with an anti-CSRF `state`)
  router.get(["/google", "/google-login", "/login"], passport.authenticate("google", { scope: ["profile", "email"] }));

  // 2) Google sends the browser back here with a one-time code; Passport exchanges it and we start a session
  router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", (err, user, info) => {
      if (err) {
        console.error("OAuth callback error:", err);
        return res.redirect(to("/signin?error=server"));
      }
      if (!user) {
        const reason = info && info.message === "not_allowed" ? "not_allowed" : "denied";
        return res.redirect(to(`/signin?error=${reason}`));
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Session start failed:", loginErr);
          return res.redirect(to("/signin?error=server"));
        }
        return res.redirect(to("/upload"));
      });
    })(req, res, next);
  });
}

router.get("/current-user", isAuthenticated, getCurrentUser);
router.post("/logout", isAuthenticated, logoutUser);

module.exports = router;
