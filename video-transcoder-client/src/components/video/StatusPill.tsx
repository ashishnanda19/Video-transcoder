import { Badge } from "@/components/ui/badge";
import type { VideoStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "success" | "warning" | "info" | "destructive";

export const STATUS_META: Record<VideoStatus, { label: string; variant: Variant; live: boolean; dot: string }> = {
  pending: { label: "Pending", variant: "secondary", live: true, dot: "bg-muted-foreground" },
  queued: { label: "Queued", variant: "warning", live: true, dot: "bg-warning" },
  starting: { label: "Starting", variant: "info", live: true, dot: "bg-info" },
  processing: { label: "Transcoding", variant: "default", live: true, dot: "bg-primary" },
  completed: { label: "Ready", variant: "success", live: false, dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", live: false, dot: "bg-destructive" },
};

export function StatusPill({ status, className }: { status: VideoStatus; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <Badge variant={meta.variant} className={className}>
      <span className="relative flex h-1.5 w-1.5">
        {meta.live && <span className={cn("absolute inline-flex h-full w-full animate-ping-soft rounded-full", meta.dot)} />}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
      </span>
      {meta.label}
    </Badge>
  );
}
