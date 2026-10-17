import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

// Where people reach the site owner about privacy requests. Set NEXT_PUBLIC_CONTACT_EMAIL when building the UI.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export const ContactLine = () =>
  CONTACT_EMAIL ? (
    <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <span>the support email shown on the Google sign-in screen</span>
  );

export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-3 mt-10 text-xl font-semibold tracking-tight">{children}</h2>
);
export const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-4 leading-relaxed text-muted-foreground">{children}</p>
);
export const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="mb-4 list-disc space-y-2 pl-6 leading-relaxed text-muted-foreground">{children}</ul>
);

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main className="container max-w-3xl py-12">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8">{children}</div>
        <div className="mt-14 flex gap-6 border-t pt-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
