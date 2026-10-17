"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl border bg-secondary shadow-soft"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <item.icon className={cn("relative h-[18px] w-[18px]", active && "text-primary")} />
            <span className="relative">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-1.5 pt-1">
        <Logo href="/upload" />
      </div>
      <Button asChild className="w-full justify-center">
        <Link href="/upload" onClick={onNavigate}>
          <Plus className="h-4 w-4" /> New upload
        </Link>
      </Button>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto rounded-2xl border bg-gradient-to-b from-accent/60 to-transparent p-4">
        <p className="text-[13px] font-medium">Every upload becomes 4 renditions</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          1080p, 720p, 480p and 360p, transcoded in parallel with live progress.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["1080p", "720p", "480p", "360p"].map((r) => (
            <span key={r} className="rounded-md border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {r}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r bg-card/40 md:block">
      <SidebarContent />
    </aside>
  );
}
