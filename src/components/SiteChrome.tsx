import Link from "next/link";
import { Logo, buttonClass } from "@/components/ui";

// পাবলিক পেজের (ল্যান্ডিং, ব্লগ) হেডার ও ফুটার

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "কীভাবে কাজ করে" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/blog", label: "ব্লগ" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader({ loggedIn = false }: { loggedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/80 backdrop-blur dark:border-zinc-900 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Hook AI হোম">
          <Logo />
        </Link>
        <nav aria-label="প্রধান মেনু" className="hidden items-center gap-6 text-sm text-zinc-600 md:flex dark:text-zinc-400">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {!loggedIn && (
            <Link href="/login" className={buttonClass("ghost", "hidden sm:inline-flex")}>
              Login
            </Link>
          )}
          <Link href={loggedIn ? "/dashboard" : "/login"} className={buttonClass("primary")}>
            {loggedIn ? "Dashboard-এ যাও" : "ফ্রি শুরু করো"}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-100 py-10 dark:border-zinc-900">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
        <Logo />
        <nav aria-label="ফুটার" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/blog" className="hover:text-zinc-900 dark:hover:text-zinc-100">ব্লগ</Link>
          <Link href="/#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100">Pricing</Link>
          <Link href="/#faq" className="hover:text-zinc-900 dark:hover:text-zinc-100">FAQ</Link>
          <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-100">Login</Link>
          <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100">Privacy</Link>
          <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100">Terms</Link>
          <Link href="/data-deletion" className="hover:text-zinc-900 dark:hover:text-zinc-100">ডাটা মুছে ফেলা</Link>
        </nav>
        <p>© {new Date().getFullYear()} Hook AI</p>
      </div>
    </footer>
  );
}
