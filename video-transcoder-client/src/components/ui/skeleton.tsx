import { cn } from "@/lib/utils"

// A placeholder block with a travelling highlight; keeps layout stable while data loads so the UI feels instant.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-secondary/70", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  )
}

export { Skeleton }
