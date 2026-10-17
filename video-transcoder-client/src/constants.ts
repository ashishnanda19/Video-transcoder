// Where the API lives.
//  - production build: same origin, under /api/v1 (Vercel's rewrite, or the API container itself, forwards it), so
//    cookies are first-party and there is no CORS.
//  - local development: the API runs on its own port.
// NEXT_PUBLIC_API_BASE overrides both at build time (e.g. to point a local UI at a remote API).
//
// NOTE: this deliberately does NOT read the old NEXT_PUBLIC_BACKEND_URL. Projects deployed before the move to AWS still
// have it set (pointing at the retired Render server) and would silently send every request there.
export const SERVER =
  process.env.NEXT_PUBLIC_API_BASE ||
  (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:8000/api/v1");
