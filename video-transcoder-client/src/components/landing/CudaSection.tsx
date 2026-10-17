"use client";

import { ArrowDown, Check, Cloud, Cpu, Layers, RefreshCcw, Zap } from "lucide-react";
import { useConfig } from "@/hooks/useConfig";

const LANES = ["1080p", "720p", "480p", "360p"];

const POINTS = [
  { icon: Layers, title: "Decode once, encode four in parallel", body: "Your video is decoded a single time and every resolution is produced at the same moment, not one after another." },
  { icon: Zap, title: "Frames stay on the GPU", body: "NVDEC decodes, CUDA scales and NVENC encodes without copying frames back to system memory. That zero-copy path is what makes GPU transcoding fast." },
  { icon: RefreshCcw, title: "Safe fallback", body: "If a file can't be handled on the GPU (an unusual codec, say), the job transparently runs on CPU instead of failing." },
  { icon: Cpu, title: "Elastic by design", body: "GPU workers start on demand, run only while there is work, and shut down when idle, so capacity follows demand." },
];

// The AWS services that orchestrate a job from upload to download.
const AWS = [
  ["Amazon S3", "storage"],
  ["AWS Lambda", "upload trigger"],
  ["Amazon ECS", "Fargate + GPU workers"],
  ["API Gateway", "secure API"],
  ["CloudWatch", "monitoring"],
  ["Terraform", "infrastructure as code"],
];

// The USP, worded from what is actually running: the server reports whether jobs currently run on NVIDIA GPUs.
// Themed: a light card in light mode, the dark "GPU" look in dark mode.
export function CudaSection() {
  const { acceleration } = useConfig();
  const live = acceleration === "gpu";

  return (
    <section id="cuda" className="container scroll-mt-20 pb-24">
      <div className="relative overflow-hidden rounded-[2rem] border bg-card shadow-card dark:border-white/10 dark:bg-[#0a0c12] dark:text-white dark:shadow-[0_30px_80px_-30px_rgba(10,12,18,0.6)]">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70 dark:opacity-30 dark:invert" />
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#76b900]/15 blur-3xl dark:bg-[#76b900]/25" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/25" />

        <div className="relative grid gap-12 p-8 md:p-14 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-secondary/70 px-3 py-1 text-xs font-medium text-foreground/80 backdrop-blur dark:border-white/15 dark:bg-white/5 dark:text-white/80">
              <span className="h-2 w-2 rounded-full bg-[#76b900]" /> Built on NVIDIA CUDA
            </p>
            <h2 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl">
              Faster by design.<br />
              <span className="bg-gradient-to-r from-[#4d7c0f] to-[#16a34a] bg-clip-text text-transparent dark:from-[#9be22a] dark:to-[#4ade80]">Parallel at every step.</span>
            </h2>
            <p className="mt-5 max-w-lg text-balance text-muted-foreground md:text-lg dark:text-white/70">
              VidFlow&apos;s pipeline is built around NVIDIA CUDA: decode once, scale on the GPU, and encode all four resolutions in parallel with NVENC, orchestrated end to end on AWS.
            </p>

            <div className={`mt-6 inline-flex max-w-lg items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${live ? "border-lime-600/30 bg-lime-50 text-lime-900 dark:border-[#76b900]/40 dark:bg-[#76b900]/10 dark:text-[#c6f27a]" : "bg-secondary/60 text-muted-foreground dark:border-white/15 dark:bg-white/5 dark:text-white/75"}`}>
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${live ? "text-lime-700 dark:text-[#9be22a]" : "text-muted-foreground dark:text-white/50"}`} strokeWidth={3} />
              <span>
                {live
                  ? "Right now: your videos are encoded on NVIDIA GPUs."
                  : "Right now: all four versions are already encoded in parallel in a single pass. The GPU path is built and tested; it switches on as GPU capacity is enabled."}
              </span>
            </div>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-100 text-lime-700 dark:bg-white/10 dark:text-[#9be22a]"><p.icon className="h-[18px] w-[18px]" /></span>
                  <span>
                    <span className="block text-sm font-semibold">{p.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground dark:text-white/60">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* the pipeline, drawn */}
          <div className="mx-auto w-full max-w-md rounded-2xl border bg-secondary/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
            <div className="rounded-xl border bg-card px-4 py-3 shadow-soft dark:border-white/10 dark:bg-white/5 dark:shadow-none">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Decode</span><span className="rounded-md bg-lime-100 px-2 py-0.5 font-mono text-[11px] text-lime-800 dark:bg-[#76b900]/20 dark:text-[#c6f27a]">NVDEC · once</span></div>
              <p className="mt-1 text-xs text-muted-foreground dark:text-white/50">One pass over your source video</p>
            </div>
            <div className="flex justify-center py-2 text-muted-foreground/60 dark:text-white/30"><ArrowDown className="h-4 w-4" /></div>
            <div className="rounded-xl border bg-card px-4 py-3 shadow-soft dark:border-white/10 dark:bg-white/5 dark:shadow-none">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Scale</span><span className="rounded-md bg-lime-100 px-2 py-0.5 font-mono text-[11px] text-lime-800 dark:bg-[#76b900]/20 dark:text-[#c6f27a]">CUDA · in GPU memory</span></div>
              <p className="mt-1 text-xs text-muted-foreground dark:text-white/50">Four sizes from the same decoded frames</p>
            </div>
            <div className="flex justify-center py-2 text-muted-foreground/60 dark:text-white/30"><ArrowDown className="h-4 w-4" /></div>
            <div className="space-y-2">
              {LANES.map((l, i) => (
                <div key={l} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-soft dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                  <span className="w-12 font-mono text-xs font-semibold">{l}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-border dark:bg-white/10">
                    <span style={{ "--i": i } as React.CSSProperties} className="cuda-lane absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#76b900] to-[#a3e635]" />
                  </span>
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 font-mono text-[11px] text-violet-700 dark:bg-violet-500/25 dark:text-violet-200">NVENC</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground dark:text-white/40">Four encoders, side by side</p>
          </div>
        </div>

        {/* AWS orchestration */}
        <div className="relative border-t px-8 py-8 md:px-14 dark:border-white/10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-sm items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"><Cloud className="h-[18px] w-[18px]" /></span>
              <span>
                <span className="block text-sm font-semibold">Orchestrated end to end on AWS</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground dark:text-white/60">From the upload to the finished files, every step is a managed AWS service, defined as code.</span>
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {AWS.map(([name, role]) => (
                <li key={name} className="rounded-xl border bg-secondary/50 px-3.5 py-2 dark:border-white/10 dark:bg-white/5">
                  <span className="block text-[13px] font-semibold leading-tight">{name}</span>
                  <span className="block text-[11px] text-muted-foreground dark:text-white/50">{role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
