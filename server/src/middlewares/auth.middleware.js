const User = require("../models/user.model.js");
const { loadConfig } = require("../config.js");
const { verifySharedSecret } = require("../utils/webhookAuth.js");

const config = loadConfig();

// Local development only (never in production, see config.js): skip Google and act as one stored dev user, so
// ownership and quotas behave exactly as they do for real users.
const authDisabled = () => config.authDisabled;
let devUser;
const getDevUser = () => {
  // Cache the resolved promise (.exec()), not the Mongoose query: a query can only be executed once.
  devUser ??= User.findOneAndUpdate(
    { googleId: "local-dev" },
    { $set: { displayName: "Local Dev", email: "local-dev@localhost", avatar: "https://github.com/shadcn.png" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .lean()
    .exec()
    .catch((error) => {
      devUser = undefined; // do not cache a failure
      throw error;
    });
  return devUser;
};

// A request is authenticated only if Passport restored a user from a valid server-side session.
// (This used to check only that *some* connect.sid cookie existed, which any client could fake.)
const isAuthenticated = async (req, res, next) => {
  try {
    if (authDisabled()) {
      req.user = await getDevUser();
      return next();
    }
    if (typeof req.isAuthenticated === "function" && req.isAuthenticated() && req.user) return next();
    return res.status(401).json({ success: false, message: "Authentication required" });
  } catch (error) {
    return next(error);
  }
};

// S3 -> Lambda -> server: the Lambda holds the shared secret. With no secret configured (local dev only; production
// refuses to boot without one) the check is skipped.
const requireWebhookSecret = (req, res, next) => {
  if (!config.webhookSecret) return next();
  if (verifySharedSecret(req.get("x-webhook-secret"), config.webhookSecret)) return next();
  return res.status(401).json({ success: false, message: "Invalid webhook credentials" });
};

module.exports = { isAuthenticated, requireWebhookSecret, authDisabled };
