"use client";

import { useEffect, useRef, useState } from "react";
import { RUNGS, type Rung } from "@/lib/api";
import { cn } from "@/lib/utils";

const DIMS: Record<Rung, string> = { "1080p": "1920×1080", "720p": "1280×720", "480p": "854×480", "360p": "640×360" };
export { DIMS };

// Native <video> with a resolution switcher that keeps the playback position and play state across switches.
export function VideoPlayer({
  urls,
  initialRung,
  autoPlay = false,
  className,
  rung: controlledRung,
  onRungChange,
}: {
  urls: Partial<Record<Rung, string>>;
  initialRung?: Rung;
  autoPlay?: boolean;
  className?: string;
  rung?: Rung;
  onRungChange?: (r: Rung) => void;
}) {
  const available = RUNGS.filter((r) => urls[r]);
  const pick = (): Rung => initialRung && urls[initialRung] ? initialRung : (["720p", "1080p", "480p", "360p"] as Rung[]).find((r) => urls[r]) ?? available[0];
  const [internal, setInternal] = useState<Rung>(pick);
  const rung = controlledRung ?? internal;
  const ref = useRef<HTMLVideoElement>(null);
  const resume = useRef<{ t: number; playing: boolean } | null>(null);

  // if the URL set changes (e.g. a rendition is missing), fall back to a rendition that exists
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!urls[rung] && available[0]) setInternal(pick()); }, [urls]);

  const choose = (r: Rung) => {
    const v = ref.current;
    if (v) resume.current = { t: v.currentTime, playing: !v.paused };
    setInternal(r);
    onRungChange?.(r);
  };

  const src = urls[rung];
  return (
    <div className={cn("relative bg-black", className)}>
      {src && (
        <video
          key={src}
          ref={ref}
          src={src}
          controls
          playsInline
          autoPlay={autoPlay}
          preload="metadata"
          className="aspect-video h-full w-full bg-black"
          onLoadedMetadata={(e) => {
            const r = resume.current;
            if (!r) return;
            e.currentTarget.currentTime = r.t;
            if (r.playing) e.currentTarget.play().catch(() => {});
            resume.current = null;
          }}
        />
      )}
      <div className="absolute left-3 top-3 flex gap-1 rounded-full bg-black/55 p-1 backdrop-blur-md">
        {available.map((r) => (
          <button
            key={r}
            onClick={() => choose(r)}
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[11px] font-medium transition",
              r === rung ? "bg-white text-black" : "text-white/75 hover:text-white"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
