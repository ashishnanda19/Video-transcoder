"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, FileVideo, RefreshCw, Search, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { VideoCard } from "@/components/video/VideoCard";
import { isTerminal, listVideos, type Video } from "@/lib/api";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "active", label: "In progress" },
  { key: "failed", label: "Failed" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const matches = (v: Video, f: Filter) =>
  f === "all" ? true : f === "ready" ? v.progress === "completed" : f === "failed" ? v.progress === "failed" : !isTerminal(v.progress);

export default function Library() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setVideos(await listVideos({ status: "all", limit: 100 }));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep in-flight jobs live: poll every 4s only while something is still processing and the tab is visible.
  const anyActive = useMemo(() => (videos ?? []).some((v) => !isTerminal(v.progress)), [videos]);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, 4000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  const counts = useMemo(() => {
    const all = videos ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((v) => matches(v, f.key)).length])) as Record<Filter, number>;
  }, [videos]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (videos ?? []).filter((v) => matches(v, filter) && (!needle || v.fileName.toLowerCase().includes(needle)));
  }, [videos, q, filter]);

  return (
    <div>
      <PageHeader
        title="Library"
        description="Every video you've uploaded, with all of its renditions."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => load(true)} aria-label="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/upload"><UploadCloud className="h-3.5 w-3.5" /> Upload</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos…" className="pl-10 pr-9" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-secondary/40 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                filter === f.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter === f.key && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-lg border bg-card shadow-soft" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">
                {f.label}
                {videos && <span className="ml-1.5 text-[11px] text-muted-foreground">{counts[f.key]}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {videos === null && !error && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border bg-card">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && videos === null && (
        <EmptyState
          icon={CloudOff}
          title="Can't reach the server"
          body="Check that the backend is running, then try again."
          action={<Button onClick={() => load(true)}>Try again</Button>}
        />
      )}

      {videos && videos.length === 0 && (
        <EmptyState
          icon={FileVideo}
          title="No videos yet"
          body="Upload your first video and it will appear here with all four renditions."
          action={<Button asChild><Link href="/upload"><UploadCloud className="h-4 w-4" /> Upload a video</Link></Button>}
        />
      )}

      {videos && videos.length > 0 && shown.length === 0 && (
        <EmptyState icon={Search} title="No matches" body="Try a different search or filter." action={<Button variant="secondary" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</Button>} />
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((v, i) => (
            <VideoCard key={v._id} video={v} index={i} onDeleted={(id) => setVideos((cur) => (cur ? cur.filter((x) => x._id !== id) : cur))} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
