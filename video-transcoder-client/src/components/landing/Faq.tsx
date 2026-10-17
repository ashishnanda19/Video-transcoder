"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useConfig } from "@/hooks/useConfig";
import { cn } from "@/lib/utils";

export function Faq() {
  const { maxUploadMb, retentionDays, dailyUploadsPerUser, acceleration } = useConfig();
  const [open, setOpen] = useState<number | null>(0);

  const items = [
    {
      q: "How long does a video take?",
      a: "A short clip is usually ready in under a minute: about 15 seconds to start the encoder, then roughly the length of the video to encode it. A 2-minute video takes a few minutes. You can close the tab; progress is kept and the page picks up where it left off.",
    },
    {
      q: "What formats and sizes can I upload?",
      a: `MP4, WebM, OGG or MOV, up to ${maxUploadMb} MB each. You get four H.264 + AAC versions (1080p, 720p, 480p and 360p) that keep your video's aspect ratio and play in every browser and phone.`,
    },
    {
      q: "Is my video private?",
      a: `Yes. Your uploads and the versions made from them are stored privately and can only be played or downloaded while you're signed in, through short-lived links. ${retentionDays > 0 ? `They're deleted automatically after ${retentionDays} days, ` : ""}and you can delete any video yourself at any time.`,
    },
    {
      q: "Is VidFlow really free?",
      a: `Yes, there's no charge and no credit card. To keep it sustainable there are fair-use limits: ${dailyUploadsPerUser} uploads per day per account, a few videos processed at once, and an overall daily capacity. If you hit one, it tells you plainly.`,
    },
    {
      q: "What do you do with my Google account?",
      a: "Google sign-in is used only to know who you are. We read your name, email address and profile picture, nothing else, and we don't see your password. You can revoke access any time from your Google account.",
    },
    {
      q: "Does VidFlow really use NVIDIA GPUs?",
      a: acceleration === "gpu"
        ? "Yes. Your videos are decoded with NVDEC, scaled with CUDA and encoded with NVENC, all on NVIDIA GPUs, with all four resolutions produced in parallel."
        : "The pipeline is built on NVIDIA CUDA (NVDEC decode, CUDA scaling, NVENC encode, all four resolutions in parallel) and it falls back to CPU automatically. Right now jobs run on CPU, still decoding once and encoding all four versions in parallel; the GPU path switches on as GPU capacity is enabled.",
    },
    {
      q: "What runs behind the scenes?",
      a: "Everything is orchestrated on AWS: your file lands in Amazon S3, a Lambda function triggers the job, Amazon ECS launches an isolated transcoding worker (Fargate on CPU today, GPU instances for CUDA), and API Gateway fronts the API. The whole stack is defined as code with Terraform.",
    },
    {
      q: "Can I download everything at once?",
      a: "Yes. Every video page has a one-click ZIP of all four versions, plus individual downloads and an in-browser player with a resolution switcher.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl divide-y rounded-2xl border bg-card shadow-soft">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-secondary/40"
            >
              <span className="text-[15px] font-medium md:text-base">{item.q}</span>
              <Plus className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-45 text-primary")} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-6 pr-12 text-sm leading-relaxed text-muted-foreground md:text-[15px]">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
