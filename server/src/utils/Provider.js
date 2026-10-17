const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const User = require("../models/user.model.js");

const connectPassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Must match the "Authorized redirect URI" in Google Cloud, e.g. http://localhost:8000/api/v1/user/login
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "https://video-transcoder-server-vvep.onrender.com/api/v1/user/login",
        scope:["profile","email"]
      },
      async function (accessToken, refreshToken, profile, done) {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            const email = profile.emails?.[0]?.value ?? null;
            const avatar = profile.photos?.[0]?.value ?? null;
            const newUser = {
              displayName: profile.displayName,
              googleId: profile.id,
              email,
              avatar,
            };

            user = await User.create(newUser);
          }

          console.log("DEBUG: Found/Created User:", user.email);
          done(null, user);
        } catch (error) {
          console.error("DEBUG: Google Auth Database Error:", error);
          done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
  });
};

module.exports = {
  connectPassport,
};
