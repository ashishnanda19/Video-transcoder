"use client";

import { useEffect } from "react";

// Optional support chat. It is only built in when NEXT_PUBLIC_CRISP_WEBSITE_ID is set at build time (and the server is
// then run with CSP_ALLOW_CRISP=true), so a default deployment loads no third-party scripts.
export const CrispChat = () => {
  const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

  useEffect(() => {
    if (!websiteId) return;
    import("crisp-sdk-web").then(({ Crisp }) => Crisp.configure(websiteId));
  }, [websiteId]);

  return null;
};
