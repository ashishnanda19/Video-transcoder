const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const User = require("../models/user.model.js");
const { isEmailAllowed, readAllowlist } = require("./allowlist.js");

// Decides who gets a session after Google has authenticated them. Pure enough to test: no req/res involved.
async function verifyGoogleProfile(profile, allowlist = readAllowlist()) {
  const email = (profile.emails || []).find((e) => e.value)?.value;
  // Google returns email_verified on the raw profile; never trust an unverified address for an access decision.
  const verified = profile._json ? profile._json.email_verified !== false : true;
  if (!email || !verified) return { user: false, reason: "unverified_email" };
  if (!isEmailAllowed(email, allowlist)) return { user: false, reason: "not_allowed", email };

  const user = await User.findOneAndUpdate(
    { googleId: profile.id },
    {
      $set: {
        displayName: profile.displayName,
        email: email.toLowerCase(),
        avatar: profile.photos?.[0]?.value ?? null,
        lastLoginAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return { user };
}

function configurePassport(config) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: config.googleCallbackUrl, // must match the Authorized redirect URI in Google Cloud exactly
        scope: ["profile", "email"],
        state: true, // anti-CSRF `state` parameter, kept in the session
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const result = await verifyGoogleProfile(profile);
          if (!result.user) {
            console.warn(`Sign-in refused (${result.reason}) for ${result.email || "unknown email"}`);
            return done(null, false, { message: result.reason });
          }
          return done(null, result.user);
        } catch (error) {
          console.error("Google sign-in error:", error);
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, String(user._id)));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, (await User.findById(id).lean()) || false);
    } catch (error) {
      done(error);
    }
  });
}

module.exports = { configurePassport, verifyGoogleProfile };
