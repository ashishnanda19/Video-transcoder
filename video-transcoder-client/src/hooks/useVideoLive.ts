"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVideoById, getVideoByName, isTerminal, type Video } from "@/lib/api";

// Loads one video and keeps it fresh while it is still moving through the pipeline.
// Right after an upload the record may not exist for a few seconds (S3 -> Lambda -> server), so a 404 is retried
// for a while instead of being shown as an error.
export function useVideoLive({ id, fileName }: { id?: string | null; fileName?: string | null }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const startedAt = useRef(Date.now());
  const key = id || fileName || "";

  const load = useCallback(async () => {
    try {
      const v = id ? await getVideoById(id) : await getVideoByName(fileName as string);
      setVideo(v);
      setNotFound(false);
      return v;
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 400) {
        // keep waiting for ~90s after landing here before telling the user it is missing
        if (Date.now() - startedAt.current > 90_000) setNotFound(true);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, fileName]);

  useEffect(() => {
    if (!key) { setLoading(false); return; }
    startedAt.current = Date.now();
    setVideo(null); setNotFound(false); setLoading(true);
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      const v = document.hidden ? undefined : await load();
      if (stop) return;
      if (v && isTerminal(v.progress)) return; // done: no more polling
      timer = setTimeout(tick, v ? 2500 : 2000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [key, load]);

  return { video, loading, notFound, reload: load };
}
