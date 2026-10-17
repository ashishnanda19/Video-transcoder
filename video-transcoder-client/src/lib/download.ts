import { getRenditionUrl, RUNGS, type Rung, type Video } from "@/lib/api";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchBlob(url: string, onProgress?: (fraction: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }
  return new Blob(chunks, { type: "video/mp4" });
}

// `a[download]` is ignored for cross-origin S3 links, so fetch the bytes and save them locally.
export async function downloadRendition(video: Video, rung: Rung, onProgress?: (fraction: number) => void) {
  const file = video.videoResolutions?.[rung];
  if (!file) throw new Error(`No ${rung} rendition`);
  const blob = await fetchBlob(await getRenditionUrl(video, file), onProgress);
  saveBlob(blob, `${video.fileName}-${rung}.mp4`);
}

export async function downloadAllAsZip(video: Video, onProgress?: (fraction: number) => void) {
  const { default: JSZip } = await import("jszip"); // loaded on demand to keep the first paint fast
  const zip = new JSZip();
  const rungs = RUNGS.filter((r) => video.videoResolutions?.[r]);
  let done = 0;
  await Promise.all(
    rungs.map(async (rung) => {
      const blob = await fetchBlob(await getRenditionUrl(video, video.videoResolutions![rung]!));
      zip.file(`${video.fileName}-${rung}.mp4`, blob);
      done += 1;
      onProgress?.(done / rungs.length);
    })
  );
  saveBlob(await zip.generateAsync({ type: "blob" }), `${video.fileName}-renditions.zip`);
}
