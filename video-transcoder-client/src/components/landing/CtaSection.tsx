import Link from "next/link";
import { ArrowRight, Check, FileVideo, Lock, MousePointer2, Timer, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

const RUNGS = [
  { name: "1080p", size: "4.9 MB" },
  { name: "720p", size: "3.5 MB" },
  { name: "480p", size: "1.0 MB" },
  { name: "360p", size: "0.6 MB" },
];

// A file drops in, uploads, and four versions pop out: the whole product in one looping 6-second picture (pure CSS).
function DropDemo() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-violet-300/40 via-sky-200/30 to-cyan-200/40 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-[0_24px_60px_-24px_hsl(var(--primary)/0.4)]">
        <div className="relative flex h-44 items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-accent/40">
          <div className="flex flex-col items-center gap-2 text-primary/70">
            <UploadCloud className="h-9 w-9" />
            <span className="text-sm font-medium">Drop a video here</span>
          </div>
          <div className="cta-file absolute flex items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-strong text-white"><FileVideo className="h-[18px] w-[18px]" /></span>
            <span>
              <span className="block text-sm font-semibold leading-tight">holiday-trip.mp4</span>
              <span className="block font-mono text-[11px] text-muted-foreground">28.4 MB</span>
            </span>
          </div>
          <MousePointer2 className="cta-cursor absolute h-6 w-6 fill-foreground text-background drop-shadow" />
          <div className="absolute inset-x-5 bottom-4 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="cta-progress h-full rounded-full bg-brand-strong" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {RUNGS.map((r, i) => (
            <div key={r.name} style={{ "--i": i } as React.CSSProperties} className="cta-chip rounded-xl border bg-background p-2.5 text-center shadow-soft">
              <span className="mx-auto mb-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              <span className="block font-mono text-[13px] font-semibold">{r.name}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{r.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CtaSection({ href, signedIn }: { href: string; signedIn: boolean }) {
  return (
    <section className="container pb-24">
      <div className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-white via-violet-50/70 to-sky-50 p-8 shadow-soft dark:from-card dark:via-card dark:to-card md:p-14">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />

        <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Timer className="h-3.5 w-3.5 text-primary" /> Typically under a minute for a short clip
            </p>
            <h2 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl">
              Drop one file.<br />
              <span className="text-gradient">Get four ready to play.</span>
            </h2>
            <p className="mt-5 max-w-md text-balance text-muted-foreground md:text-lg">
              Sign in with Google, upload a video, and watch it turn into 1080p, 720p, 480p and 360p versions you can preview and download.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link href={href}>{signedIn ? "Open your library" : "Try it with your video"} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Private by default</span>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No credit card", "Google sign-in only", "Delete anytime"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" strokeWidth={3} />{t}</li>
              ))}
            </ul>
          </div>
          <DropDemo />
        </div>
      </div>
    </section>
  );
}
