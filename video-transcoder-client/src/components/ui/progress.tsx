import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number // 0-100; omit for an indeterminate bar
}

function Progress({ value, className, ...props }: ProgressProps) {
  const indeterminate = value === undefined
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-brand-strong" />
      ) : (
        <div
          className="h-full rounded-full bg-brand-strong transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      )}
    </div>
  )
}

export { Progress }
