"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import { PIPELINE, RUNGS, type Video } from "@/lib/api";
import { downloadAllAsZip } from "@/lib/download";
import { timeAgo } from "@/lib/format";
import { DeleteVideoDialog, canDelete } from "./DeleteVideoDialog";
import { PlayerDialog } from "./PlayerDialog";
import { StatusPill } from "./StatusPill";
import { VideoThumb } from "./VideoThumb";

export function VideoCard({ video, index = 0, onDeleted }: { video: Video; index?: number; onDeleted?: (id: string) => void }) {
  const [playing, setPlaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zip, setZip] = useState<number | null>(null);
  const done = video.progress === "completed";
  const failed = video.progress === "failed";
  const href = `/assets?id=${video._id}`;
  const step = Math.max(0, PIPELINE.findIndex((p) => p.key === video.progress));

  const download = async () => {
    setZip(0);
    try {
      await downloadAllAsZip(video, setZip);
    } catch {
      toast({ title: "Download failed", description: "Could not fetch the renditions. Please try again.", variant: "destructive" });
    } finally {
      setZip(null);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className="group overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
    >
      <Link href={href} className="block" aria-label={`Open ${video.fileName}`}>
        <VideoThumb video={video} />
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href} className="block truncate text-[15px] font-semibold tracking-tight hover:text-primary" title={video.fileName}>
              {video.fileName}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(video.createdAt)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusPill status={video.progress} />
            {canDelete(video) && (
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${video.fileName}`}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {done && (
          <div className="flex flex-wrap gap-1.5">
            {RUNGS.filter((r) => video.videoResolutions?.[r]).map((r) => (
              <span key={r} className="rounded-md border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r}
              </span>
            ))}
          </div>
        )}

        {!done && !failed && (
          <div className="space-y-1.5">
            <Progress value={((step + 0.5) / PIPELINE.length) * 100} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">{PIPELINE[step]?.hint}…</p>
          </div>
        )}
        {failed && <p className="text-[11px] text-destructive">Transcoding failed — open to see details.</p>}

        {done && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={() => setPlaying(true)}>
              <Play className="h-3.5 w-3.5 fill-current" /> Play
            </Button>
            <Button size="sm" variant="secondary" loading={zip !== null} onClick={download} aria-label="Download all renditions as ZIP">
              {zip === null && <Download className="h-3.5 w-3.5" />}
              {zip === null ? "ZIP" : `${Math.round(zip * 100)}%`}
            </Button>
          </div>
        )}
      </div>

      {done && <PlayerDialog video={video} open={playing} onOpenChange={setPlaying} />}
      <DeleteVideoDialog video={video} open={confirmDelete} onOpenChange={setConfirmDelete} onDeleted={() => onDeleted?.(video._id)} />
    </motion.article>
  );
}
