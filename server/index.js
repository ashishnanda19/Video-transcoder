require("dotenv").config();
const { loadConfig } = require("./src/config.js");

const config = loadConfig();
if (config.problems.length) {
  console.error("Refusing to start; fix the configuration:\n - " + config.problems.join("\n - "));
  process.exit(1);
}

if (!config.authDisabled && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
  console.error(
    "No sign-in method configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (see docs/go-live.md), " +
      "or for local development only set AUTH_DISABLED=true."
  );
  process.exit(1);
}

const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const mongoose = require("mongoose");
const { connectDB } = require("./src/db/database.js");
const { configurePassport } = require("./src/auth/passport.js");
const { SESSION_COOKIE } = require("./src/controllers/user.controller.js");
const transcoderRoutes = require("./src/routes/transcoder.route.js");
const userRoutes = require("./src/routes/user.route.js");

async function main() {
  await connectDB();

  const app = express();
  // Behind CloudFront / API Gateway / a load balancer: believe X-Forwarded-* (client IP, protocol).
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  const s3Origin = `https://*.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com`;
  const crisp = process.env.CSP_ALLOW_CRISP === "true"; // only if the optional Crisp chat widget is built in
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // What the UI really loads: its own files, avatars, and videos/uploads that go straight to/from S3 over signed URLs.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", ...(crisp ? ["https://client.crisp.chat"] : [])], // Next's static export inlines its bootstrap
          styleSrc: ["'self'", "'unsafe-inline'", ...(crisp ? ["https://client.crisp.chat"] : [])],
          imgSrc: ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com", "https://github.com", "https://avatars.githubusercontent.com", ...(crisp ? ["https://*.crisp.chat"] : [])],
          mediaSrc: ["'self'", "blob:", s3Origin],
          connectSrc: ["'self'", s3Origin, ...(crisp ? ["https://*.crisp.chat", "wss://*.relay.crisp.chat"] : [])],
          fontSrc: ["'self'", "data:", ...(crisp ? ["https://client.crisp.chat"] : [])],
          frameSrc: crisp ? ["https://*.crisp.chat"] : ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    })
  );

  // The public site is HTTPS-only, but intermediate hops may not forward the protocol. Without this, express-session
  // refuses to set a `secure` cookie and sign-in silently fails.
  if (config.production && config.publicUrl.startsWith("https://")) {
    app.use((req, _res, next) => {
      req.headers["x-forwarded-proto"] = "https";
      next();
    });
  }

  // Production serves the UI and the API from one origin (no CORS). Locally the UI is on another port.
  if (config.frontendUrl) {
    app.use(cors({ origin: config.frontendUrl, credentials: true, methods: ["GET", "POST", "PUT", "DELETE"] }));
  }

  app.use(express.json({ limit: "64kb" }));

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: process.env.SESSION_SECRET || "local-development-only-secret",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      // Sessions live in MongoDB: they survive restarts and work across several server instances.
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: "sessions",
        ttl: 14 * 24 * 60 * 60,
        touchAfter: 24 * 60 * 60,
      }),
      cookie: {
        httpOnly: true, // not readable by page JavaScript
        secure: config.production, // HTTPS only in production
        sameSite: "lax", // not sent on cross-site POSTs: CSRF protection
        maxAge: 14 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
  if (config.authDisabled) {
    console.warn("AUTH_DISABLED=true: Google login is OFF, every request acts as the local dev user. Never use this on a public server.");
  } else {
    configurePassport(config);
  }

  // Liveness only (does not touch the database), so a database hiccup never makes the platform kill a healthy process.
  app.get("/health", (req, res) => res.status(200).json({ ok: true }));
  app.get("/api/v1/health", (req, res) => res.status(200).json({ ok: true }));

  app.use("/api/v1/video", transcoderRoutes);
  app.use("/api/v1/user", userRoutes);

  // The exported UI (built into the image at ./public). Hashed assets are cached for a year; pages are always revalidated.
  const publicDir = path.join(__dirname, "public");
  const hasUi = fs.existsSync(path.join(publicDir, "index.html"));
  if (hasUi) {
    app.use(
      express.static(publicDir, {
        index: "index.html", // /upload/ -> /upload/index.html (a bare /upload is redirected to /upload/)
        setHeaders: (res, file) => {
          res.setHeader(
            "Cache-Control",
            file.includes(`${path.sep}_next${path.sep}static${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
          );
        },
      })
    );
  }

  if (!hasUi) app.get("/", (req, res) => res.status(200).json({ message: "Hello from root!" }));

  app.use((req, res) => {
    if (hasUi && !req.path.startsWith("/api/") && req.accepts("html")) {
      return res.status(404).sendFile(path.join(publicDir, "404.html"));
    }
    return res.status(404).json({ success: false, message: "Not found" });
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  });

  // Start the queue poller only once the app is up (it connects to Redis on import).
  require("./src/jobs/queueProcessor.js");
  require("./src/jobs/retention.js").startRetentionSweep();

  const port = process.env.PORT || 8000;
  const server = app.listen(port, () => console.log(`Server is running on port ${port}`));

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
