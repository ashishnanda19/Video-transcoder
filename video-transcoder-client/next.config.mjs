/** @type {import('next').NextConfig} */
const nextConfig = {
  // The whole UI is client-side (it talks to the API with fetch), so it ships as plain static files:
  // S3 + CloudFront in production, no Node server to run or patch.
  output: "export",
  // /upload is exported as upload.html. No trailing-slash redirects: with them, Vercel redirected /api/x to /api/x/
  // before its proxy rule (which does not match a trailing slash) could apply, so the API was unreachable.
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
