"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Download, FileQuestion, Loader2, Package, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { DeleteVideoDialog, canDelete } from "@/components/video/DeleteVideoDialog";
import { PipelineTracker } from "@/components/video/PipelineTracker";
import { StatusPill } from "@/components/video/StatusPill";
import { DIMS, VideoPlayer } from "@/components/video/VideoPlayer";
import { useRenditionUrls } from "@/hooks/useRenditionUrls";
import { useVideoLive } from "@/hooks/useVideoLive";
import { RUNGS, type Rung, type Video } from "@/lib/api";
import { downloadAllAsZip, downloadRendition } from "@/lib/download";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function VideoDetail({ id, fileName }: { id: string | null; fileName: string | null }) {
  const { video, loading, notFound } = useVideoLive({ id, fileName });

  if (notFound) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-20 text-center">
        <FileQuestion className="mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Video not found</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">It may have been removed, or the upload never reached the server.</p>
        <Button asChild className="mt-6"><Link href="/assets">Back to library</Link></Button>
      </div>
    );
  }

  return (
    <div>
      <Link href="/assets" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      {!video ? <WaitingState loading={loading} fileName={fileName} /> : <Loaded video={video} />}
    </div>
  );
}

function WaitingState({ loading, fileName }: { loading: boolean; fileName: string | null }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Card className="p-8">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="relative">
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary/30" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-strong text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">{loading ? "Loading…" : "Waiting for your upload to be picked up"}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {fileName ? <>“{fileName}” is on its way to the transcoder. </> : null}This usually takes a few seconds, and the page updates by itself.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Loaded({ video }: { video: Video }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = video.progress === "completed";
  const { urls, loading: urlsLoading, error } = useRenditionUrls(video);
  const [rung, setRung] = useState<Rung | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [zip, setZip] = useState<number | null>(null);
  const available = RUNGS.filter((r) => video.videoResolutions?.[r]);

  const download = async (r: Rung) => {
    setBusy(r);
    try {
      await downloadRendition(video, r);
    } catch {
      toast({ title: "Download failed", description: `Could not download the ${r} file.`, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async () => {
    setZip(0);
    try {
      await downloadAllAsZip(video, setZip);
      toast({ title: "ZIP ready", description: `${available.length} renditions saved.`, variant: "success" });
    } catch {
      toast({ title: "Download failed", description: "Could not build the ZIP. Please try again.", variant: "destructive" });
    } finally {
      setZip(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{video.fileName}</h1>
            <StatusPill status={video.progress} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">Uploaded {timeAgo(video.createdAt)} · {formatDateTime(video.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {done && (
            <Button variant="secondary" loading={zip !== null} onClick={downloadZip}>
              {zip === null && <Package className="h-4 w-4" />}
              {zip === null ? "Download all (ZIP)" : `Zipping ${Math.round(zip * 100)}%`}
            </Button>
          )}
          {canDelete(video) && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
        <DeleteVideoDialog video={video} open={confirmDelete} onOpenChange={setConfirmDelete} onDeleted={() => router.push("/assets")} />
      </div>

      {done ? (
        <Card className="overflow-hidden">
          {Object.keys(urls).length > 0 ? (
            <VideoPlayer urls={urls} rung={rung} onRungChange={setRung} className="w-full" />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-black/90 text-sm text-white/70">
              {error ?? (urlsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Preparing preview…")}
            </div>
          )}
        </Card>
      ) : (
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <h2 className="mb-1 text-base font-semibold">{video.progress === "failed" ? "Something went wrong" : "Transcoding in progress"}</h2>
            <p className="mb-8 text-sm text-muted-foreground">
              {video.progress === "failed" ? "The job stopped before all renditions were produced." : "This page updates automatically. You can leave and come back anytime."}
            </p>
            <PipelineTracker status={video.progress} />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Renditions</h2>
          <span className="text-xs text-muted-foreground">{done ? `${available.length} files · H.264 + AAC` : "Available when transcoding finishes"}</span>
        </div>
        <ul className="divide-y">
          {RUNGS.map((r) => {
            const file = video.videoResolutions?.[r];
            const active = rung === r;
            return (
              <li key={r} className={cn("flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors", active && "bg-accent/40")}>
                <span className="w-16 font-mono text-sm font-semibold">{r}</span>
                <span className="hidden w-24 text-xs text-muted-foreground sm:block">{DIMS[r]}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{file ?? (video.progress === "failed" ? "—" : "Waiting…")}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="soft" disabled={!file || !urls[r]} onClick={() => { setRung(r); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <Play className="h-3.5 w-3.5 fill-current" /> Play
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!file} loading={busy === r} onClick={() => download(r)}>
                    {busy !== r && <Download className="h-3.5 w-3.5" />} Download
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="grid gap-px overflow-hidden bg-border sm:grid-cols-3">
        {[
          ["Source file", video.objectKey.split("/").pop() ?? video.objectKey],
          ["Job ID", video._id],
          ["Last update", video.updatedAt ? timeAgo(video.updatedAt) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 truncate font-mono text-[13px]" title={v}>{v}</p>
          </div>
        ))}
      </Card>
    </motion.div>
  );
}
