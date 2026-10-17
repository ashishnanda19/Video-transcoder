/** @type {import('next').NextConfig} */
const nextConfig = {
  // The whole UI is client-side (it talks to the API with fetch), so it ships as plain static files:
  // S3 + CloudFront in production, no Node server to run or patch.
  output: "export",
  trailingSlash: true, // /upload -> /upload/index.html, which static hosts serve without rewrites
  images: { unoptimized: true },
};

export default nextConfig;
