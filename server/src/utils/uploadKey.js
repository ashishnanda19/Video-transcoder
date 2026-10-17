// Upload validation + object-key construction. Keys are built by the server (never taken from the client) and are
// unique per upload, so two users (or two uploads) with the same file name can never collide.
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

function sanitizeFileName(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() || "";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*#%&+]/g, "_") // control chars and characters that break URLs/keys
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, ""); // no leading dots/spaces (hidden or relative-looking names)
  if (!cleaned) return "video";
  // keep the extension, shorten the stem
  const dot = cleaned.lastIndexOf(".");
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot).slice(0, 8) : "";
  return `${stem.slice(0, 100)}${ext}`;
}

// The title shown in the UI: the file name without its extension.
const titleFromFileName = (name) => {
  const clean = sanitizeFileName(name);
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(0, dot) : clean;
};

const buildUploadKey = ({ videoId, fileName }) => `uploads/videos/${videoId}/${sanitizeFileName(fileName)}`;
const buildOutputPrefix = (videoId) => `videos/${videoId}`;

function validateUploadRequest({ fileName, contentType, size }, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!fileName || typeof fileName !== "string") return "fileName is required";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) return "Unsupported format. Use MP4, WebM, OGG or MOV.";
  const n = Number(size);
  if (!Number.isInteger(n) || n <= 0) return "size must be the file size in bytes";
  if (n > maxBytes) return `File is too large (limit ${Math.round(maxBytes / 1024 / 1024)} MB)`;
  return null;
}

module.exports = {
  MAX_UPLOAD_BYTES,
  ALLOWED_CONTENT_TYPES,
  sanitizeFileName,
  titleFromFileName,
  buildUploadKey,
  buildOutputPrefix,
  validateUploadRequest,
};
