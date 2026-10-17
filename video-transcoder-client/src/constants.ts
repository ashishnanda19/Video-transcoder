// Where the API lives.
//  - production build: same origin, under /api/v1 (CloudFront routes /api/* to the API), so cookies are first-party
//    and there is no CORS.
//  - local development: the API runs on its own port.
// Override with NEXT_PUBLIC_BACKEND_URL at build time (e.g. to point a local UI at a remote API).
export const SERVER =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:8000/api/v1");
