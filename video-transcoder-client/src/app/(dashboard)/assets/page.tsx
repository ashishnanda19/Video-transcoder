"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import Library from "./Library";
import VideoDetail from "./VideoDetail";

function AssetsRouter() {
  const params = useSearchParams();
  const id = params.get("id");
  const fileName = params.get("fileName");
  // /assets            -> the library
  // /assets?id=…       -> one video (links from the library)
  // /assets?fileName=… -> one video (where the upload page lands before the record has an id)
  if (id || fileName) return <VideoDetail id={id} fileName={fileName} />;
  return <Library />;
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <AssetsRouter />
    </Suspense>
  );
}
