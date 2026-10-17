"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

// The product demo that loops in the hero (public/hero-loop.mp4, generated from media/hero-scene.html by
// scripts/render-hero.mjs). Muted + playsInline so every browser may autoplay it; the still poster shows first, and
// stays for people who prefer reduced motion. A pause button keeps it accessible.
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const v = ref.current;
    if (v && !mq.matches) v.play().catch(() => setPlaying(false));
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* soft glow behind the window */}
      <div className="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 rounded-[2.5rem] bg-brand opacity-25 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.45)] ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex items-center gap-2 border-b bg-secondary/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto flex h-7 w-full max-w-sm items-center justify-center rounded-md border bg-background/70 px-3 font-mono text-[11px] text-muted-foreground">
            vidflow-transcoder.vercel.app
          </div>
          <span className="w-12" />
        </div>
        <div className="relative aspect-video bg-[#f6f6fb]">
          <video
            ref={ref}
            className="absolute inset-0 h-full w-full object-cover"
            src="/hero-loop.mp4"
            poster="/hero-poster.jpg"
            muted
            loop
            playsInline
            preload={reduced ? "none" : "auto"}
            aria-label="Animation: a video is uploaded, split into 1080p, 720p, 480p and 360p versions, and marked ready"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          <button
            onClick={toggle}
            aria-label={playing ? "Pause the demo animation" : "Play the demo animation"}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border bg-background/85 text-foreground shadow-soft backdrop-blur transition hover:scale-105"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
        </div>
      </div>
    </div>
  );
}
