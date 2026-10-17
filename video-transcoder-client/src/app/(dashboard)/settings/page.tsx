"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Copy, Globe, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/PageHeader";
import { SERVER } from "@/constants";
import { RUNGS } from "@/lib/api";
import { DIMS } from "@/components/video/VideoPlayer";
import { cn } from "@/lib/utils";

const THEMES = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

type Health = { state: "checking" } | { state: "ok"; ms: number } | { state: "down" };

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [copied, setCopied] = useState(false);
  useEffect(() => setMounted(true), []);

  // The server's health route lives at its root, one level above /api/v1.
  const check = useCallback(async () => {
    setHealth({ state: "checking" });
    const t0 = performance.now();
    try {
      const res = await fetch(SERVER.replace(/\/api\/v1\/?$/, "") + "/", { cache: "no-store" });
      setHealth(res.ok ? { state: "ok", ms: Math.round(performance.now() - t0) } : { state: "down" });
    } catch {
      setHealth({ state: "down" });
    }
  }, []);
  useEffect(() => { check(); }, [check]);

  const copy = async () => {
    await navigator.clipboard.writeText(SERVER).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Appearance, connection status and output defaults." />

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose how VidFlow looks on this device.</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {THEMES.map((t) => {
              const active = mounted && theme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  aria-pressed={active}
                  className={cn("flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-sm font-medium transition-all", active ? "border-primary bg-accent/60 shadow-glow" : "bg-secondary/30 text-muted-foreground hover:border-foreground/20 hover:text-foreground")}
                >
                  <t.icon className={cn("h-5 w-5", active && "text-primary")} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Backend connection</h2>
              <p className="mt-1 text-sm text-muted-foreground">The API this app talks to.</p>
            </div>
            <div className="flex items-center gap-2">
              {health.state === "checking" && <Badge variant="secondary">Checking…</Badge>}
              {health.state === "ok" && <Badge variant="success">Connected · {health.ms} ms</Badge>}
              {health.state === "down" && <Badge variant="destructive">Unreachable</Badge>}
              <Button variant="ghost" size="icon" onClick={check} aria-label="Re-check"><RefreshCw className={cn("h-4 w-4", health.state === "checking" && "animate-spin")} /></Button>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-xl border bg-secondary/40 px-3.5 py-2.5">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{SERVER}</code>
            <Button variant="ghost" size="sm" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">Output ladder</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every upload is encoded to these renditions. Each fits its 16:9 frame with the original aspect ratio preserved.</p>
          <div className="mt-5 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2.5 font-medium">Rendition</th><th className="px-4 py-2.5 font-medium">Max frame</th><th className="px-4 py-2.5 font-medium">Codec</th></tr>
              </thead>
              <tbody className="divide-y">
                {RUNGS.map((r) => (
                  <tr key={r}>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{DIMS[r]}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">H.264 + AAC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
