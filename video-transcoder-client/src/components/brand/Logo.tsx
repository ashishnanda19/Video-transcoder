import Link from "next/link";
import { cn } from "@/lib/utils";

// The tile is a CSS gradient rather than an SVG gradient: SVG gradient ids are document-global, so a second copy of
// the logo inside a hidden (display:none) sidebar would hijack the reference and the visible one would render blank.
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-strong shadow-sm", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[52%] w-[52%] translate-x-[1px]" fill="#fff">
        <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" />
      </svg>
    </span>
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
