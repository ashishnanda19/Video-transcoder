"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, FileVideo, Loader2, LogOut, Mail, ShieldCheck, XCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { useAuth, useSignOut } from "@/hooks/useAuth";
import { isTerminal, listVideos, type Video } from "@/lib/api";

export default function AccountPage() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const [videos, setVideos] = useState<Video[] | null>(null);

  useEffect(() => { listVideos({ status: "all", limit: 100 }).then(setVideos).catch(() => setVideos([])); }, []);

  const stats = [
    { label: "Total videos", value: videos?.length, icon: FileVideo, tone: "text-primary bg-primary/10" },
    { label: "Ready", value: videos?.filter((v) => v.progress === "completed").length, icon: CheckCircle2, tone: "text-success bg-success/10" },
    { label: "In progress", value: videos?.filter((v) => !isTerminal(v.progress)).length, icon: Loader2, tone: "text-info bg-info/10" },
    { label: "Failed", value: videos?.filter((v) => v.progress === "failed").length, icon: XCircle, tone: "text-destructive bg-destructive/10" },
  ];
  const initials = (user?.displayName || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      <PageHeader title="Account" description="Your profile and a snapshot of your library." />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="overflow-hidden">
          <div className="noise relative h-28 bg-brand-deep-animated animate-gradient-pan"><div className="absolute inset-0 bg-grid opacity-30" /></div>
          <div className="px-6 pb-6">
            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
              <Avatar className="h-24 w-24 border-4 border-card shadow-xl">
                <AvatarImage src={user?.avatar} alt={user?.displayName} />
                <AvatarFallback className="bg-brand-strong text-2xl font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <Button variant="secondary" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{user?.displayName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{user?.email}</span>
              <Badge variant="success"><ShieldCheck className="h-3 w-3" /> Signed in with Google</Badge>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
            <Card className="p-5">
              <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl ${s.tone}`}><s.icon className="h-[18px] w-[18px]" /></div>
              {s.value === undefined ? <Skeleton className="h-8 w-12" /> : <p className="text-3xl font-semibold tracking-tight tabular-nums">{s.value}</p>}
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="ghost" asChild><Link href="/assets">View library →</Link></Button>
      </div>
    </div>
  );
}
