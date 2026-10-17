import axios from "axios";
import { SERVER } from "@/constants";

export type VideoStatus = "pending" | "queued" | "starting" | "processing" | "completed" | "failed";
export const RUNGS = ["1080p", "720p", "480p", "360p"] as const;
export type Rung = (typeof RUNGS)[number];

export interface Video {
  _id: string;
  fileName: string;
  objectKey: string;
  type?: string;
  progress: VideoStatus;
  videoResolutions?: Partial<Record<Rung, string>>;
  createdAt: string;
  updatedAt?: string;
}

// The pipeline a video moves through, in order. `failed` is a terminal branch handled separately in the UI.
export const PIPELINE: { key: VideoStatus; label: string; hint: string }[] = [
  { key: "queued", label: "Queued", hint: "Waiting for a free transcoding slot" },
  { key: "starting", label: "Starting", hint: "Launching the transcoding worker" },
  { key: "processing", label: "Transcoding", hint: "Encoding every resolution" },
  { key: "completed", label: "Ready", hint: "All renditions are available" },
];

export const isTerminal = (s?: VideoStatus) => s === "completed" || s === "failed";

export const api = axios.create({ baseURL: SERVER, withCredentials: true });

// A 401 anywhere except the initial "who am I?" probe means the session expired mid-use: send the user to sign in
// again instead of leaving a page that silently fails.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? "";
    if (typeof window !== "undefined" && error?.response?.status === 401 && !url.includes("current-user")) {
      window.location.assign("/signin/?error=expired");
    }
    return Promise.reject(error);
  }
);

// The server's own explanation (limits, validation) when it sent one, else a fallback.
export const apiErrorMessage = (error: any, fallback = "Something went wrong") =>
  error?.response?.data?.message || error?.message || fallback;

type Envelope<T> = { data: T };

export async function listVideos(opts: { status?: "all" | VideoStatus; query?: string; limit?: number } = {}) {
  const { data } = await api.get<Envelope<Video[]>>("/video/get-all-videos", {
    params: { status: opts.status ?? "all", query: opts.query || undefined, limit: opts.limit ?? 60 },
  });
  return data.data;
}

export async function getVideoByName(fileName: string) {
  const { data } = await api.get<Envelope<Video>>(`/video/v/${encodeURIComponent(fileName)}`);
  return data.data;
}

export async function getVideoById(id: string) {
  const { data } = await api.get<Envelope<Video>>(`/video/id/${encodeURIComponent(id)}`);
  return data.data;
}

// Step 1 of an upload: the server validates, creates the record and returns a signed URL for exactly this file.
export async function createUpload(file: { name: string; type: string; size: number }) {
  const { data } = await api.post<Envelope<{ videoId: string; uploadUrl: string; expiresIn: number }>>("/video/uploads", {
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  return data.data;
}

export async function deleteVideo(id: string) {
  await api.delete(`/video/id/${encodeURIComponent(id)}`);
}

export interface PublicConfig {
  maxUploadMb: number;
  retentionDays: number;
  dailyUploadsPerUser: number;
}
export const DEFAULT_CONFIG: PublicConfig = { maxUploadMb: 30, retentionDays: 30, dailyUploadsPerUser: 20 };

export async function getPublicConfig() {
  const { data } = await api.get<Envelope<PublicConfig>>("/video/config");
  return data.data;
}

// Signed GET URL for one rendition (expires, so fetch it when needed rather than storing it).
export async function getRenditionUrl(videoId: string, rung: Rung, opts: { download?: boolean } = {}) {
  const { data } = await api.get<Envelope<string>>(`/video/id/${encodeURIComponent(videoId)}/rendition/${rung}`, {
    params: opts.download ? { download: 1 } : undefined,
  });
  return data.data;
}
