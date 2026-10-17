"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { apiErrorMessage, deleteVideo, isTerminal, type Video } from "@/lib/api";

// Confirmation + deletion of one video (its renditions and its record). Only offered once the job has finished.
export function DeleteVideoDialog({
  video,
  open,
  onOpenChange,
  onDeleted,
}: {
  video: Video;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteVideo(video._id);
      toast({ title: "Video deleted", description: `"${video.fileName}" and all its renditions were removed.`, variant: "success" });
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast({ title: "Could not delete", description: apiErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <Trash2 className="h-5 w-5" />
        </div>
        <DialogTitle className="text-lg font-semibold tracking-tight">Delete this video?</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{video.fileName}</span> and all of its renditions will be permanently
          removed. This can&apos;t be undone.
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>Cancel</Button>
          </DialogClose>
          <Button variant="destructive" loading={busy} onClick={confirm}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const canDelete = (video: Video) => isTerminal(video.progress) || video.progress === "pending";
