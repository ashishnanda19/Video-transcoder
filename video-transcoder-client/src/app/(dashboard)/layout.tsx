"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  // Signed-out visitors are sent to /signin; while we find out who they are, show the shell with placeholders.
  const { loading, isAuthenticated } = useAuth({ requireAuth: true });
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {loading || !isAuthenticated ? (
            <div className="space-y-6">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            // a quick fade/slide on every page change makes navigation feel instant rather than abrupt
            <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }}>
              {children}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
