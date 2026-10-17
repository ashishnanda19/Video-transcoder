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

export async function getUploadUrl(fileName: string, contentType: string) {
  const { data } = await api.get<Envelope<string>>("/video/get-upload-url", { params: { fileName, contentType } });
  return data.data;
}

// Signed GET URL for one rendition file (expires, so fetch it when needed rather than storing it).
export async function getRenditionUrl(video: Pick<Video, "fileName">, file: string) {
  const { data } = await api.get<Envelope<string>>("/video/get-video-urls", {
    params: { fileName: video.fileName, videoUrl: file },
  });
  return data.data;
}
