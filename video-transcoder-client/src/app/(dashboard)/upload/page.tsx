"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CloudUpload, FileVideo, Film, Gauge, Lock, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import { PageHeader } from "@/components/shell/PageHeader";
import { apiErrorMessage, createUpload, RUNGS } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { useConfig } from "@/hooks/useConfig";
import { DIMS } from "@/components/video/VideoPlayer";
import { cn } from "@/lib/utils";

const ALLOWED = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

type Phase = "idle" | "preparing" | "uploading" | "done" | "error";
interface Meta { duration?: number; width?: number; height?: number }

// fetch() cannot report upload progress, so the PUT to S3 goes through XMLHttpRequest.
function putWithProgress(url: string, file: File, onProgress: (loaded: number, total: number) => void, signal: { xhr?: XMLHttpRequest }) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}

export default function UploadPage() {
  const router = useRouter();
  const config = useConfig();
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = useRef<{ xhr?: XMLHttpRequest }>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta>({});
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); setMeta({}); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = useCallback((f?: File | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast({ title: "Unsupported format", description: "Please choose an MP4, WebM, OGG or MOV video.", variant: "destructive" });
      return;
    }
    if (f.size > maxBytes) {
      toast({ title: "File too large", description: `That file is ${formatBytes(f.size)}. The limit is ${formatBytes(maxBytes, 0)}.`, variant: "destructive" });
      return;
    }
    setFile(f); setPhase("idle"); setProgress(0); setError(null);
  }, [maxBytes]);

  const start = async () => {
    if (!file) return;
    setError(null); setProgress(0); setSpeed(0);
    try {
      setPhase("preparing");
      // The server validates the file, creates its record and signs a link for exactly this size and type.
      const { videoId, uploadUrl } = await createUpload(file);
      if (!uploadUrl) throw new Error("The server did not return an upload link");

      setPhase("uploading");
      const t0 = performance.now();
      await putWithProgress(uploadUrl, file, (loaded, total) => {
        setProgress(loaded / total);
        setSpeed(loaded / Math.max(0.25, (performance.now() - t0) / 1000));
      }, handle.current);

      setPhase("done");
      setProgress(1);
      toast({ title: "Upload complete", description: "Your video is now in the transcoding queue.", variant: "success" });
      setTimeout(() => router.push(`/assets?id=${videoId}`), 700);
    } catch (e: any) {
      if (e?.message === "aborted") { setPhase("idle"); setProgress(0); return; }
      setPhase("error");
      setError(apiErrorMessage(e)); // includes the server's own reason (limits, validation)
    }
  };

  const cancel = () => handle.current.xhr?.abort();
  const reset = () => { setFile(null); setPhase("idle"); setProgress(0); setError(null); if (inputRef.current) inputRef.current.value = ""; };
  const busy = phase === "preparing" || phase === "uploading";

  return (
    <div>
      <PageHeader title="Upload a video" description="Drop a file and we'll produce 1080p, 720p, 480p and 360p versions automatically." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <input ref={inputRef} type="file" accept={ALLOWED.join(",")} className="hidden" onChange={(e) => accept(e.target.files?.[0])} />

          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div
                key="drop"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                className={cn(
                  "group relative flex min-h-[380px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed px-6 text-center transition-all duration-200",
                  dragging ? "scale-[1.01] border-primary bg-primary/10 shadow-glow" : "border-border bg-card/50 hover:border-primary/50 hover:bg-card"
                )}
              >
                <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
                <div className="relative flex flex-col items-center">
                  <div className={cn("mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-strong text-white shadow-glow transition-transform duration-300", dragging ? "scale-110 -rotate-3" : "group-hover:-translate-y-1")}>
                    <CloudUpload className="h-9 w-9" />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">{dragging ? "Drop it here" : "Drag & drop your video"}</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">or click to browse. MP4, WebM, OGG or MOV, up to {formatBytes(maxBytes, 0)}.</p>
                  <Button className="mt-7" size="lg" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                    <FileVideo className="h-4 w-4" /> Choose a file
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="file" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Card className="overflow-hidden">
                  <div className="relative aspect-video bg-black">
                    {preview && (
                      <video
                        src={preview}
                        muted
                        loop
                        playsInline
                        autoPlay
                        className="h-full w-full object-contain"
                        onLoadedMetadata={(e) => setMeta({ duration: e.currentTarget.duration, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
                      />
                    )}
                    {!busy && phase !== "done" && (
                      <button onClick={reset} aria-label="Remove file" className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white/80 backdrop-blur transition hover:bg-black/80 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {phase === "done" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
                          <Check className="h-8 w-8" strokeWidth={3} />
                        </motion.div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold" title={file.name}>{file.name}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatBytes(file.size)}</span>
                          {meta.duration !== undefined && <span>{formatDuration(meta.duration)}</span>}
                          {meta.width ? <span>{meta.width}×{meta.height}</span> : null}
                          <span className="uppercase">{file.type.replace("video/", "")}</span>
                        </div>
                      </div>
                    </div>

                    {(busy || phase === "done") && (
                      <div className="space-y-2.5">
                        <Progress value={phase === "preparing" ? undefined : progress * 100} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {phase === "preparing" && "Creating a secure upload link…"}
                            {phase === "uploading" && `Uploading… ${Math.round(progress * 100)}%`}
                            {phase === "done" && "Uploaded — opening your video…"}
                          </span>
                          {phase === "uploading" && (
                            <span className="inline-flex items-center gap-1.5 font-mono"><Gauge className="h-3.5 w-3.5" />{formatBytes(speed)}/s</span>
                          )}
                        </div>
                      </div>
                    )}

                    {error && (
                      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">{error}</div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      {phase === "error" ? (
                        <Button onClick={start}><RotateCcw className="h-4 w-4" /> Try again</Button>
                      ) : (
                        <Button size="lg" onClick={start} loading={busy} disabled={phase === "done"} className="min-w-44">
                          {!busy && <CloudUpload className="h-4 w-4" />}
                          {busy ? "Uploading…" : phase === "done" ? "Done" : "Upload & transcode"}
                        </Button>
                      )}
                      {busy && <Button variant="ghost" size="lg" onClick={cancel}>Cancel</Button>}
                      {!busy && phase !== "done" && <Button variant="ghost" size="lg" onClick={reset}>Choose another</Button>}
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">You&apos;ll get</h3>
            </div>
            <ul className="space-y-2.5">
              {RUNGS.map((r, i) => (
                <motion.li key={r} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex items-center justify-between rounded-xl border bg-secondary/40 px-3.5 py-2.5">
                  <span className="font-mono text-sm font-semibold">{r}</span>
                  <span className="text-xs text-muted-foreground">{DIMS[r]}</span>
                </motion.li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">H.264 video with AAC audio, aspect ratio preserved. Encoded in parallel.</p>
            {config.retentionDays > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Videos are deleted automatically after {config.retentionDays} days. You can delete them sooner from your library.
              </p>
            )}
          </Card>
          <Card className="flex gap-3 p-5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your file goes straight to private cloud storage over a short-lived signed link. It never passes through our server.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
