const express = require("express");
const transcoderRoutes = require("./src/routes/transcoder.route.js");
const userRoutes = require("./src/routes/user.route.js");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./src/db/database.js");
const cors = require("cors");
const { connectPassport } = require("./src/utils/Provider.js");
const { authDisabled } = require("./src/middlewares/auth.middleware.js");
const session = require("express-session");
const passport = require("passport");
const dotenv = require("dotenv");
require("./src/jobs/queueProcessor.js"); // Start the polling for transcoding jobs queued in Redis

const app = express();

dotenv.config();

connectDB()
  .then(() => {
    app.on("error", (error) => {
      console.log("Error:", error);
      throw error;
    });
  })
  .catch((err) => {
    console.log("MongoDb connection Failed !!", err);
  });

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,

    cookie: {
      // Secure cross-site cookies need HTTPS; on http://localhost they would never be stored.
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);
app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.enable("trust proxy");
app.use(passport.initialize());
app.use(passport.session());

if (authDisabled()) {
  console.warn("AUTH_DISABLED=true: Google login is OFF, every request acts as the local dev user. Never use this on a public server.");
} else {
  connectPassport();
}

app.get("/", (req, res, next) => {
  return res.status(200).json({
    message: "Hello from root!",
  });
});

app.use("/api/v1/video", transcoderRoutes);
app.use("/api/v1/user", userRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
