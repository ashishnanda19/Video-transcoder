
// Set NEXT_PUBLIC_BACKEND_URL in your Vercel environment variables
// Format: https://<your-render-app>.onrender.com/api/v1
export const SERVER =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000/api/v1";