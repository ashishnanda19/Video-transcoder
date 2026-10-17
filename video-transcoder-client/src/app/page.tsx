"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight, BadgeCheck, CloudUpload, Cpu, Download, Gauge, Layers, Lock, Play, Radio, Rocket, Zap,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.08 * i, ease: "easeOut" as const } }),
};

const FEATURES = [
  { icon: Layers, title: "Every resolution, one upload", body: "1080p, 720p, 480p and 360p are produced together, with the original aspect ratio and audio preserved." },
  { icon: Zap, title: "GPU-accelerated encoding", body: "NVIDIA NVDEC → CUDA scaling → NVENC keeps frames on the GPU end to end, with an automatic CPU fallback." },
  { icon: Gauge, title: "Scales to zero", body: "GPU capacity appears when a job arrives and disappears when the queue is empty, so idle time costs nothing." },
  { icon: Radio, title: "Live progress", body: "Follow each video from queued to ready in real time, no refreshing and no guessing." },
  { icon: Lock, title: "Private by design", body: "Files go straight to private cloud storage over short-lived signed links. Nothing is public." },
  { icon: Download, title: "Preview & download", body: "Play any rendition in the browser, grab a single file, or download all of them as a ZIP." },
];

const STEPS = [
  { icon: CloudUpload, title: "Upload", body: "Drop a video. It streams directly to secure storage." },
  { icon: Rocket, title: "Queue & launch", body: "A rate limiter schedules the job and starts a transcoding worker." },
  { icon: Cpu, title: "Transcode", body: "One decode, four encodes. Resolutions are produced in parallel." },
  { icon: BadgeCheck, title: "Deliver", body: "Preview, stream or download every rendition instantly." },
];

function PipelineVisual() {
  const nodes = [
    { label: "Upload", icon: CloudUpload },
    { label: "Queue", icon: Layers },
    { label: "Transcode", icon: Cpu },
    { label: "Ready", icon: BadgeCheck },
  ];
  return (
    <div className="relative mx-auto mt-16 w-full max-w-4xl">
      <div className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-[2rem] bg-brand opacity-20 blur-3xl" />
      <div className="overflow-hidden rounded-3xl border bg-card/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-400/80" /><span className="h-3 w-3 rounded-full bg-yellow-400/80" /><span className="h-3 w-3 rounded-full bg-green-400/80" />
          <span className="ml-3 font-mono text-xs text-muted-foreground">vidflow / holiday-trip.mp4</span>
        </div>
        <div className="grid gap-8 p-6 md:grid-cols-[1.1fr_1fr] md:p-8">
          <div>
            <div className="relative flex items-start justify-between">
              <div className="absolute left-[8%] right-[8%] top-5 h-0.5 bg-border" />
              <motion.div className="absolute left-[8%] top-5 h-0.5 bg-brand-strong" initial={{ width: 0 }} animate={{ width: "84%" }} transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.2 }} />
              {nodes.map((n, i) => (
                <motion.div key={n.label} className="relative z-10 flex w-1/4 flex-col items-center gap-2" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 * i, duration: 0.4, repeat: Infinity, repeatDelay: 3.4, repeatType: "reverse" }}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/60 bg-card text-primary shadow-glow">
                    <n.icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-xs font-medium">{n.label}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 space-y-2.5">
              {["1080p", "720p", "480p", "360p"].map((r, i) => (
                <div key={r} className="flex items-center gap-3">
                  <span className="w-12 font-mono text-xs text-muted-foreground">{r}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <motion.div className="h-full rounded-full bg-brand-strong" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.8 + i * 0.35, ease: "easeOut", repeat: Infinity, repeatDelay: 2.2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600/40 via-blue-600/30 to-cyan-500/30">
            <div className="absolute inset-0 bg-grid opacity-40" />
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }} className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-2xl">
              <Play className="ml-1 h-7 w-7 fill-current" />
            </motion.div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-medium text-white/90">
              <span className="rounded-md bg-black/40 px-2 py-1 backdrop-blur">Ready · 4 renditions</span>
              <span className="rounded-md bg-black/40 px-2 py-1 font-mono backdrop-blur">1080p</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const { isAuthenticated, loading } = useAuth();
  const cta = isAuthenticated ? "/upload" : "/signin";

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-grid" />
      <div className="pointer-events-none absolute left-1/2 top-[-240px] -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand opacity-25 blur-[120px]" />

      <header className="sticky top-0 z-40 border-b border-transparent bg-background/60 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#how" className="transition hover:text-foreground">How it works</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!isAuthenticated && !loading && (
              <Button variant="ghost" asChild className="hidden sm:inline-flex"><Link href="/signin">Sign in</Link></Button>
            )}
            <Button asChild><Link href={cta}>{isAuthenticated ? "Open app" : "Get started"}</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="container pb-24 pt-16 text-center md:pt-24">
          <div style={{ animationDelay: "0ms" }} className="animate-fade-up mx-auto mb-7 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-success" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
            Built for NVIDIA GPU encoding
          </div>
          <h1 style={{ animationDelay: "80ms" }} className="animate-fade-up mx-auto max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            Transcode once.<br /><span className="text-gradient">Play everywhere.</span>
          </h1>
          <p style={{ animationDelay: "160ms" }} className="animate-fade-up mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
            Upload a video and get crisp 1080p, 720p, 480p and 360p versions in minutes, with live progress, instant previews and one-click downloads.
          </p>
          <div style={{ animationDelay: "240ms" }} className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto"><Link href={cta}>{isAuthenticated ? "Go to your library" : "Start transcoding free"} <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button size="lg" variant="secondary" asChild className="w-full sm:w-auto"><a href="#how">See how it works</a></Button>
          </div>
          <div style={{ animationDelay: "340ms" }} className="animate-fade-up"><PipelineVisual /></div>
        </section>

        <section className="border-y bg-card/30">
          <div className="container grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
            {[["4", "resolutions per upload"], ["H.264", "+ AAC, plays anywhere"], ["GPU", "NVENC-ready, with CPU fallback"], ["$0", "while idle (scale to zero)"]].map(([big, small]) => (
              <div key={small} className="text-center">
                <p className="text-3xl font-semibold tracking-tight text-gradient md:text-4xl">{big}</p>
                <p className="mt-1 text-sm text-muted-foreground">{small}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="container scroll-mt-20 py-24">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-medium text-primary">Features</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">Everything you need to ship video</h2>
            <p className="mt-4 text-muted-foreground">Built on queues, containers and GPUs so you don&apos;t have to be.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={fadeUp} custom={i % 3}
                className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition group-hover:bg-brand-strong group-hover:text-white">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="how" className="container scroll-mt-20 pb-24">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-medium text-primary">How it works</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">From upload to ready in four steps</h2>
          </div>
          <div className="relative grid gap-8 md:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
            {STEPS.map((s, i) => (
              <motion.div key={s.title} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} custom={i} className="relative text-center">
                <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border bg-card text-primary shadow-soft">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-strong text-[11px] font-semibold text-white">{i + 1}</span>
                </div>
                <h3 className="font-semibold tracking-tight">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-[220px] text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="container pb-24">
          <div className="noise relative overflow-hidden rounded-[2rem] bg-brand-deep-animated animate-gradient-pan px-6 py-16 text-center text-white md:py-20">
            <div className="absolute inset-0 bg-grid opacity-30" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">Ready to transcode your first video?</h2>
              <p className="mx-auto mt-4 max-w-xl text-white/80">Sign in, drop a file, and watch it become four ready-to-stream versions.</p>
              <Button size="lg" asChild className="mt-8 bg-white text-black shadow-xl hover:bg-white/90 hover:brightness-100">
                <Link href={cta}>{isAuthenticated ? "Open the app" : "Get started free"} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <Link href="/privacy" className="transition hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition hover:text-foreground">Terms</Link>
            <p>© {new Date().getFullYear()} VidFlow. Built with Next.js, AWS and FFmpeg.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
