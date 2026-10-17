"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Check, CloudUpload, Cpu, Download, Layers, Lock, Radio, Rocket, Timer, Trash2,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CtaSection } from "@/components/landing/CtaSection";
import { Faq } from "@/components/landing/Faq";
import { HeroVideo } from "@/components/landing/HeroVideo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useConfig } from "@/hooks/useConfig";

const reveal: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.05 * i, ease: "easeOut" as const } }),
};

const FEATURES = [
  { icon: Layers, title: "Every resolution, one upload", body: "1080p, 720p, 480p and 360p are produced together, keeping your video's aspect ratio and audio." },
  { icon: Radio, title: "Live progress", body: "Follow each video from queued to ready in real time. Close the tab and come back; it keeps going." },
  { icon: Download, title: "Preview and download", body: "Play any version in the browser with a resolution switcher, grab one file, or download all four as a ZIP." },
  { icon: Lock, title: "Private by default", body: "Files go straight to private cloud storage over short-lived signed links. Only you can play or download them." },
  { icon: Cpu, title: "Isolated, elastic encoding", body: "Every job runs in its own container, queued fairly. GPU acceleration is built in and switches on when capacity is added." },
  { icon: Trash2, title: "You stay in control", body: "Delete any video whenever you like. Everything is removed automatically after a set number of days." },
];

const STEPS = [
  { icon: CloudUpload, title: "Upload", body: "Drop a video. It goes straight to secure storage." },
  { icon: Rocket, title: "Queue and launch", body: "A scheduler starts a dedicated encoder for it." },
  { icon: Cpu, title: "Transcode", body: "Decoded once, encoded to four resolutions together." },
  { icon: BadgeCheck, title: "Deliver", body: "Preview, stream or download every version." },
];

export default function Page() {
  const { isAuthenticated, loading } = useAuth();
  const { maxUploadMb, retentionDays } = useConfig();
  const cta = isAuthenticated ? "/upload" : "/signin";

  const trust = [
    "No credit card",
    `Up to ${maxUploadMb} MB per video`,
    ...(retentionDays > 0 ? [`Auto-deleted after ${retentionDays} days`] : []),
    "Private by default",
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] bg-grid" />
      <div className="pointer-events-none absolute left-1/2 top-[-260px] -z-10 h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-brand opacity-[0.22] blur-[120px] dark:opacity-25" />

      <header className="sticky top-0 z-40 border-b border-transparent bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#how" className="transition hover:text-foreground">How it works</a>
            <a href="#faq" className="transition hover:text-foreground">FAQ</a>
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
        <section className="container pb-20 pt-14 text-center md:pt-20">
          <div style={{ animationDelay: "0ms" }} className="animate-fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-success" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
            Free to use · Sign in with Google
          </div>
          <h1 style={{ animationDelay: "60ms" }} className="animate-fade-up mx-auto max-w-4xl text-balance text-5xl font-semibold leading-[1.04] tracking-tight md:text-7xl">
            Transcode once.<br /><span className="text-gradient">Play everywhere.</span>
          </h1>
          <p style={{ animationDelay: "120ms" }} className="animate-fade-up mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground md:text-xl">
            Upload a video and get crisp 1080p, 720p, 480p and 360p versions in about a minute, with live progress, instant previews and one-click downloads.
          </p>
          <div style={{ animationDelay: "180ms" }} className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto"><Link href={cta}>{isAuthenticated ? "Go to your library" : "Start transcoding"} <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button size="lg" variant="secondary" asChild className="w-full sm:w-auto"><a href="#how">See how it works</a></Button>
          </div>
          <ul style={{ animationDelay: "240ms" }} className="animate-fade-up mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trust.map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" strokeWidth={3} />{t}</li>
            ))}
          </ul>
          <div style={{ animationDelay: "320ms" }} className="animate-fade-up mt-14"><HeroVideo /></div>
        </section>

        <section className="border-y bg-card/50">
          <div className="container grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
            {[["4", "resolutions from one upload"], ["< 1 min", "for a short clip, end to end"], ["H.264 + AAC", "plays on every device"], ["Private", "signed links, deletable anytime"]].map(([big, small]) => (
              <div key={small} className="text-center">
                <p className="text-2xl font-semibold tracking-tight text-gradient md:text-3xl">{big}</p>
                <p className="mt-1 text-sm text-muted-foreground">{small}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="container scroll-mt-20 py-24">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-medium text-primary">Features</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">Everything you need to ship video</h2>
            <p className="mt-4 text-muted-foreground">Simple on the surface, a proper pipeline underneath.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={reveal} custom={i % 3}
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
              <motion.div key={s.title} initial="hidden" whileInView="show" viewport={{ once: true }} variants={reveal} custom={i} className="relative text-center">
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

        <section id="faq" className="container scroll-mt-20 pb-24">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-sm font-medium text-primary">FAQ</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">Questions, answered</h2>
          </div>
          <Faq />
        </section>

        <CtaSection href={cta} signedIn={isAuthenticated} />
      </main>

      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <Link href="/privacy" className="transition hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition hover:text-foreground">Terms</Link>
            <p className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> © {new Date().getFullYear()} VidFlow</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
