"use client";

import { useEffect, useState } from "react";
import { getRenditionUrl, RUNGS, type Rung, type Video } from "@/lib/api";

type UrlMap = Partial<Record<Rung, string>>;

// Signed URLs expire (15 min by default), so keep a short-lived module cache instead of fetching on every render.
const cache = new Map<string, { urls: UrlMap; at: number }>();
const TTL = 10 * 60 * 1000;

export function useRenditionUrls(video: Video | null | undefined, enabled = true) {
  const [urls, setUrls] = useState<UrlMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = enabled && video?.progress === "completed" && !!video.videoResolutions;
  const id = video?._id;

  useEffect(() => {
    if (!ready || !video) return;
    const hit = cache.get(video._id);
    if (hit && Date.now() - hit.at < TTL) { setUrls(hit.urls); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(
      RUNGS.filter((r) => video.videoResolutions?.[r]).map(async (r) => [r, await getRenditionUrl(video._id, r)] as const)
    )
      .then((pairs) => {
        const map = Object.fromEntries(pairs) as UrlMap;
        cache.set(video._id, { urls: map, at: Date.now() });
        if (!cancelled) setUrls(map);
      })
      .catch(() => !cancelled && setError("Could not load the video files."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  return { urls, loading, error };
}
