"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Check, Cpu, Hourglass, Rocket, Sparkles } from "lucide-react";
import { PIPELINE, type VideoStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICONS = [Hourglass, Rocket, Cpu, Sparkles];

// pending is the instant before the server has queued it, so it shares the first step.
const stepIndex = (s: VideoStatus) => (s === "pending" ? 0 : Math.max(0, PIPELINE.findIndex((p) => p.key === s)));

export function PipelineTracker({ status, compact = false }: { status: VideoStatus; compact?: boolean }) {
  const failed = status === "failed";
  const active = failed ? -1 : stepIndex(status);
  const done = status === "completed";
  const count = PIPELINE.length;

  return (
    <div>
      <div className="relative flex items-start justify-between">
        {/* connector track */}
        <div className="absolute left-0 right-0 top-[18px] mx-[18px] h-0.5 rounded-full bg-border" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-brand-strong"
            initial={false}
            animate={{ width: failed ? "0%" : `${(Math.min(active, count - 1) / (count - 1)) * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        {PIPELINE.map((step, i) => {
          const complete = !failed && (i < active || done);
          const current = !failed && i === active && !done;
          const Icon = ICONS[i];
          return (
            <div key={step.key} className="relative z-10 flex w-1/4 flex-col items-center text-center">
              <div className="relative">
                {current && <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary/40" />}
                <motion.div
                  initial={false}
                  animate={{ scale: current ? 1.08 : 1 }}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors duration-300",
                    complete && "border-transparent bg-brand-strong text-white",
                    current && "border-primary bg-card text-primary shadow-glow",
                    !complete && !current && "border-border bg-card text-muted-foreground",
                    failed && "opacity-60"
                  )}
                >
                  {complete ? <Check className="h-[18px] w-[18px]" strokeWidth={3} /> : <Icon className={cn("h-4 w-4", current && step.key === "processing" && "animate-pulse")} />}
                </motion.div>
              </div>
              <p className={cn("mt-2.5 text-xs font-medium", complete || current ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
              {!compact && (
                <p className="mt-0.5 hidden max-w-[130px] text-[11px] leading-snug text-muted-foreground sm:block">{current ? step.hint : ""}</p>
              )}
            </div>
          );
        })}
      </div>
      {failed && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Transcoding failed. The source file may be corrupt or use an unsupported codec. Try uploading it again, or
            re-export it as H.264 MP4.
          </p>
        </div>
      )}
    </div>
  );
}
