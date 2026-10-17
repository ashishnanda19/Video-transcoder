"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRenditionUrls } from "@/hooks/useRenditionUrls";
import type { Video } from "@/lib/api";
import { VideoPlayer } from "./VideoPlayer";

export function PlayerDialog({ video, open, onOpenChange }: { video: Video; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { urls, loading, error } = useRenditionUrls(video, open);
  const hasUrls = Object.keys(urls).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-white/10 bg-black p-0">
        <DialogTitle className="sr-only">{video.fileName}</DialogTitle>
        <DialogDescription className="sr-only">Video preview with resolution switcher</DialogDescription>
        {hasUrls ? (
          <VideoPlayer urls={urls} autoPlay />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/70">
            {error ?? (loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Preparing preview…")}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-zinc-950 px-4 py-3">
          <p className="truncate text-sm font-medium text-white">{video.fileName}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
