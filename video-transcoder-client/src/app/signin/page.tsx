"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { SERVER } from "@/constants";

const POINTS = [
  "Four resolutions from a single upload",
  "Live progress from queue to ready",
  "Preview in the browser, download as ZIP",
  "Private storage with signed links",
];

// Why a sign-in attempt ended up back here (the server redirects with ?error=...).
const ERRORS: Record<string, string> = {
  not_allowed: "That Google account isn't on the access list. Ask the owner to add your email, or try another account.",
  denied: "Sign-in was cancelled or Google refused it. Please try again.",
  server: "Something went wrong while signing you in. Please try again in a moment.",
  expired: "Your session expired. Please sign in again.",
};

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const errorKey = params.get("error");
  const error = errorKey ? ERRORS[errorKey] ?? ERRORS.server : null;

  // Someone who is already signed in has no business here, unless they were just bounced for being refused.
  useEffect(() => { if (isAuthenticated && !errorKey) router.replace("/upload"); }, [isAuthenticated, errorKey, router]);

  const login = () => {
    setLoading(true);
    // The server owns the OAuth flow: this endpoint redirects to Google and, afterwards, back into the app.
    window.location.href = `${SERVER}/user/google`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
      <div className="mb-8 lg:hidden"><Logo /></div>
      <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to upload videos and manage your library.</p>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Button variant="secondary" size="lg" className="mt-6 h-12 w-full gap-3 bg-card text-[15px]" loading={loading} onClick={login}>
        {!loading && <GoogleG />} Continue with Google
      </Button>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        We only read your name, email and profile picture. Access is limited to approved accounts.
      </p>
    </motion.div>
  );
}

export default function SignInPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="noise relative hidden overflow-hidden bg-brand-deep-animated animate-gradient-pan p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative"><Logo className="[&_span]:text-white [&_.text-gradient]:bg-none [&_.text-gradient]:text-white" /></div>
        <div className="relative max-w-md">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Video transcoding that just works.</h1>
          <ul className="mt-9 space-y-4">
            {POINTS.map((p, i) => (
              <motion.li key={p} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                {p}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Built with Next.js, AWS and FFmpeg.</p>
      </div>

      <div className="relative flex flex-col px-6 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">
          {/* useSearchParams needs a Suspense boundary for static export */}
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
