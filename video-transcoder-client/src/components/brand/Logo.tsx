import Link from "next/link";
import { cn } from "@/lib/utils";

// The VidFlow mark: the supplied logo, shown as a rounded tile so it reads on both light and dark backgrounds.
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={32}
      height={32}
      aria-hidden
      className={cn("inline-block h-8 w-8 shrink-0 rounded-[10px] bg-[#0a0c0f] object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/15", className)}
    />
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark className="transition-transform duration-200 group-hover:scale-105" />
      <span className="text-[17px] font-semibold tracking-tight">
        Vid<span className="text-gradient">Flow</span>
      </span>
    </Link>
  );
}
