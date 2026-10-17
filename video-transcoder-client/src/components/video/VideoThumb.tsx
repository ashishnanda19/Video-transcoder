"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Film, Loader2, Play } from "lucide-react";
import { getRenditionUrl, type Rung, type Video } from "@/lib/api";
import { cn } from "@/lib/utils";

const thumbCache = new Map<string, { url: string; at: number }>();

// For finished videos, shows a real frame from the smallest rendition (fetched lazily, only when scrolled into view).
export function VideoThumb({ video, className }: { video: Video; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [painted, setPainted] = useState(false);
  const thumbRung: Rung | undefined = (["360p", "480p", "720p"] as Rung[]).find((r) => video.videoResolutions?.[r]);
  const ready = video.progress === "completed" && !!thumbRung;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io: IntersectionObserver = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !visible || !thumbRung) return;
    const hit = thumbCache.get(video._id);
    if (hit && Date.now() - hit.at < 10 * 60_000) { setSrc(hit.url); return; }
    let cancelled = false;
    getRenditionUrl(video._id, thumbRung)
      .then((url) => { thumbCache.set(video._id, { url, at: Date.now() }); if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ready, visible, thumbRung, video]);

  const failed = video.progress === "failed";
  return (
    <div ref={box} className={cn("relative aspect-video overflow-hidden bg-gradient-to-br from-primary/15 via-info/10 to-secondary", className)}>
      {/* placeholder stays underneath; the real frame fades in once the browser has actually decoded it */}
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70">
        {failed ? <AlertTriangle className="h-7 w-7 text-destructive/80" /> : ready ? <Film className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin text-primary/70" />}
      </div>
      {src && (
        <video
          src={`${src}#t=1`}
          preload="metadata"
          muted
          playsInline
          onLoadedData={() => setPainted(true)}
          className={cn("absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105", painted ? "opacity-100" : "opacity-0")}
        />
      )}
      {src && painted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </div>
      )}
    </div>
  );
}
