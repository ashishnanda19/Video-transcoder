import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid" />
      <LogoMark className="mb-6 h-14 w-14" />
      <p className="font-mono text-sm text-primary">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">This frame doesn&apos;t exist</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The page you&apos;re looking for was moved or never rendered.</p>
      <Button asChild className="mt-8"><Link href="/">Back to home</Link></Button>
    </div>
  );
}
