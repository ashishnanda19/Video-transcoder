// Central place for deployment settings, with fail-fast validation in production: a half-configured public server
// (open sign-up, unauthenticated webhooks, default session secret) is worse than one that refuses to start.
const { readAllowlist, isAllowlistConfigured } = require("./auth/allowlist.js");

const REQUIRED_IN_PRODUCTION = [
  "MONGO_URI",
  "REDIS_URL",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PUBLIC_URL",
  "WEBHOOK_SECRET",
  "TEMP_S3_BUCKET_NAME",
  "FINAL_S3_BUCKET_NAME",
];

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const authDisabled = env.AUTH_DISABLED === "true" && !production;
  const problems = [];

  if (production) {
    for (const name of REQUIRED_IN_PRODUCTION) if (!env[name]) problems.push(`${name} is required in production`);
    if (env.AUTH_DISABLED === "true") problems.push("AUTH_DISABLED must not be set in production");
    if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) problems.push("SESSION_SECRET must be at least 32 characters");
    if (env.WEBHOOK_SECRET && env.WEBHOOK_SECRET.length < 32) problems.push("WEBHOOK_SECRET must be at least 32 characters");
    if (env.PUBLIC_URL && !/^https:\/\//.test(env.PUBLIC_URL)) problems.push("PUBLIC_URL must be an https:// URL");
    if (!isAllowlistConfigured(readAllowlist(env))) problems.push("set ALLOWED_EMAILS or ALLOWED_EMAIL_DOMAINS (or ALLOW_ANYONE=true to open sign-up deliberately)");
  }

  const publicUrl = (env.PUBLIC_URL || "").replace(/\/+$/, "");
  return {
    production,
    authDisabled,
    problems,
    publicUrl,
    frontendUrl: (env.FRONTEND_URL || "").replace(/\/+$/, ""), // only used in local dev where the UI runs on another port
    googleCallbackUrl: env.GOOGLE_CALLBACK_URL || (publicUrl ? `${publicUrl}/api/v1/user/google/callback` : "/api/v1/user/google/callback"),
    webhookSecret: env.WEBHOOK_SECRET || "",
    limits: {
      maxActiveJobsPerUser: Number(env.USER_MAX_ACTIVE_JOBS || 3),
      uploadsPerUserPerDay: Number(env.USER_DAILY_UPLOADS || 20),
      // A ceiling for the WHOLE service per rolling 24 h, so open sign-up can never spend more than a known amount.
      uploadsPerDayGlobal: Number(env.GLOBAL_DAILY_UPLOADS || 100),
    },
    // Videos (source and renditions) are deleted this many days after upload. 0 disables the sweep.
    retentionDays: env.RETENTION_DAYS === undefined || env.RETENTION_DAYS === "" ? 30 : Number(env.RETENTION_DAYS),
  };
}

module.exports = { loadConfig, REQUIRED_IN_PRODUCTION };
