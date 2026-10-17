"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, useSignOut } from "@/hooks/useAuth";

const initials = (name?: string) =>
  (name || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function UserMenu() {
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (loading) return <Skeleton className="h-9 w-9 rounded-full" />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border bg-secondary/60 p-0.5 pr-3 transition hover:bg-secondary"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar} alt={user?.displayName} />
          <AvatarFallback className="bg-brand-strong text-xs font-semibold text-white">{initials(user?.displayName)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[140px] truncate text-sm font-medium sm:block">{user?.displayName ?? "Account"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-2xl"
          >
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{user?.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            {[
              { href: "/user", label: "Account", icon: UserIcon },
              { href: "/settings", label: "Settings", icon: Settings },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <i.icon className="h-4 w-4" /> {i.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              role="menuitem"
              onClick={() => { setOpen(false); signOut(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
