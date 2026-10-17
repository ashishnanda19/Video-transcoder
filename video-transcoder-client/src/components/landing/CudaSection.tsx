"use client";

import { ArrowDown, Check, Cpu, Layers, RefreshCcw, Zap } from "lucide-react";
import { useConfig } from "@/hooks/useConfig";

const LANES = ["1080p", "720p", "480p", "360p"];

const POINTS = [
  { icon: Layers, title: "Decode once, encode four in parallel", body: "Your video is decoded a single time and every resolution is produced at the same moment, not one after another." },
  { icon: Zap, title: "Frames stay on the GPU", body: "NVDEC decodes, CUDA scales and NVENC encodes without copying frames back to system memory. That zero-copy path is what makes GPU transcoding fast." },
  { icon: RefreshCcw, title: "Safe fallback", body: "If a file can't be handled on the GPU (an unusual codec, say), the job transparently runs on CPU instead of failing." },
  { icon: Cpu, title: "Elastic by design", body: "GPU workers start on demand, run only while there is work, and shut down when idle, so capacity follows demand." },
];

// The USP, worded from what is actually running: the server reports whether jobs currently run on NVIDIA GPUs.
export function CudaSection() {
  const { acceleration } = useConfig();
  const live = acceleration === "gpu";

  return (
    <section id="cuda" className="container scroll-mt-20 pb-24">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#0a0c12] text-white shadow-[0_30px_80px_-30px_rgba(10,12,18,0.6)]">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 invert" />
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#76b900]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-violet-500/25 blur-3xl" />

        <div className="relative grid gap-12 p-8 md:p-14 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#76b900]" /> Built on NVIDIA CUDA
            </p>
            <h2 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl">
              Faster by design.<br /><span className="bg-gradient-to-r from-[#9be22a] to-[#4ade80] bg-clip-text text-transparent">Parallel at every step.</span>
            </h2>
            <p className="mt-5 max-w-lg text-balance text-white/70 md:text-lg">
              VidFlow&apos;s pipeline is built around NVIDIA CUDA: decode once, scale on the GPU, and encode all four resolutions in parallel with NVENC.
            </p>

            <div className={`mt-6 inline-flex max-w-lg items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${live ? "border-[#76b900]/40 bg-[#76b900]/10 text-[#c6f27a]" : "border-white/15 bg-white/5 text-white/75"}`}>
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${live ? "text-[#9be22a]" : "text-white/50"}`} strokeWidth={3} />
              <span>
                {live
                  ? "Right now: your videos are encoded on NVIDIA GPUs."
                  : "Right now: all four versions are already encoded in parallel in a single pass. The GPU path is built and tested; it switches on as GPU capacity is enabled."}
              </span>
            </div>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#9be22a]"><p.icon className="h-[18px] w-[18px]" /></span>
                  <span>
                    <span className="block text-sm font-semibold">{p.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-white/60">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* the pipeline, drawn */}
          <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Decode</span><span className="rounded-md bg-[#76b900]/20 px-2 py-0.5 font-mono text-[11px] text-[#c6f27a]">NVDEC · once</span></div>
              <p className="mt-1 text-xs text-white/50">One pass over your source video</p>
            </div>
            <div className="flex justify-center py-2 text-white/30"><ArrowDown className="h-4 w-4" /></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Scale</span><span className="rounded-md bg-[#76b900]/20 px-2 py-0.5 font-mono text-[11px] text-[#c6f27a]">CUDA · in GPU memory</span></div>
              <p className="mt-1 text-xs text-white/50">Four sizes from the same decoded frames</p>
            </div>
            <div className="flex justify-center py-2 text-white/30"><ArrowDown className="h-4 w-4" /></div>
            <div className="space-y-2">
              {LANES.map((l, i) => (
                <div key={l} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="w-12 font-mono text-xs font-semibold">{l}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span style={{ "--i": i } as React.CSSProperties} className="cuda-lane absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#76b900] to-[#a3e635]" />
                  </span>
                  <span className="rounded-md bg-violet-500/25 px-2 py-0.5 font-mono text-[11px] text-violet-200">NVENC</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-white/40">Four encoders, side by side</p>
          </div>
        </div>
      </div>
    </section>
  );
}
