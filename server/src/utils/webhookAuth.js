const crypto = require("node:crypto");

// Two server-to-server callers reach public endpoints and must prove who they are:
//   * the S3 -> Lambda trigger sends the shared secret in `X-Webhook-Secret`
//   * each transcoding container sends a token derived from ITS job id: HMAC(secret, jobId), so a token leaked from one
//     job's environment can only ever report on that one job.
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const signJob = (jobId, secret) => crypto.createHmac("sha256", String(secret)).update(String(jobId)).digest("hex");

const verifySharedSecret = (provided, secret) => Boolean(secret) && safeEqual(provided, secret);

const verifyJobToken = (jobId, token, secret) => Boolean(secret) && Boolean(jobId) && safeEqual(token, signJob(jobId, secret));

module.exports = { signJob, verifySharedSecret, verifyJobToken, safeEqual };
