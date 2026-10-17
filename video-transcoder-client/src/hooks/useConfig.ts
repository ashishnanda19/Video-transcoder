"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CONFIG, getPublicConfig, type PublicConfig } from "@/lib/api";

let cached: PublicConfig | null = null;

// The server's own limits (max upload size, how long videos are kept), so the UI text can never disagree with it.
// Shows sensible defaults instantly and corrects itself when the server answers.
export function useConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(cached ?? DEFAULT_CONFIG);
  useEffect(() => {
    if (cached) return;
    getPublicConfig().then((c) => { cached = c; setConfig(c); }).catch(() => {});
  }, []);
  return config;
}
