import Link from "next/link";
import { Logo, buttonClass } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";
import { getTr } from "@/lib/i18n-server";

// Header and footer for the public pages (landing, blog, legal)

// Colour fields that stay put behind the page while it scrolls, so glass always has
// something to blur. The parent needs `relative isolate`.
export function Backdrop() {
  return <div aria-hidden className="aurora grain pointer-events-none fixed inset-0 -z-10" />;
}

export async function SiteHeader({ loggedIn = false }: { loggedIn?: boolean }) {
  const tr = await getTr();
  const nav = [
    { href: "/#features", label: tr("Features", "ফিচার") },
    { href: "/#how", label: tr("How it works", "কীভাবে কাজ করে") },
    { href: "/#pricing", label: tr("Pricing", "দাম") },
    { href: "/blog", label: tr("Blog", "ব্লগ") },
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="glass mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl px-3 py-2 sm:px-4">
        <Link href="/" aria-label={tr("Hook AI home", "Hook AI হোম")}>
          <span className="sm:hidden">
            <Logo compact />
          </span>
          <span className="hidden sm:block">
            <Logo />
          </span>
        </Link>
        <nav
          aria-label={tr("Main menu", "প্রধান মেনু")}
          className="hidden items-center gap-6 text-sm text-zinc-600 md:flex dark:text-zinc-300"
        >
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-zinc-950 dark:hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          {!loggedIn && (
            <Link href="/login" className={buttonClass("ghost", "hidden sm:inline-flex")}>
              {tr("Log in", "লগইন")}
            </Link>
          )}
          <Link
            href={loggedIn ? "/dashboard" : "/login"}
            className={buttonClass("primary", "rounded-xl")}
          >
            {loggedIn ? tr("Dashboard", "ড্যাশবোর্ড") : tr("Start free", "ফ্রি শুরু করো")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const tr = await getTr();
  const links = [
    { href: "/blog", label: tr("Blog", "ব্লগ") },
    { href: "/#pricing", label: tr("Pricing", "দাম") },
    { href: "/#faq", label: "FAQ" },
    { href: "/login", label: tr("Log in", "লগইন") },
    { href: "/privacy", label: tr("Privacy", "প্রাইভেসি") },
    { href: "/terms", label: tr("Terms", "শর্তাবলি") },
    { href: "/data-deletion", label: tr("Data deletion", "ডাটা মুছে ফেলা") },
  ];
  return (
    <footer className="border-t border-zinc-900/5 py-10 dark:border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
        <Logo />
        <nav aria-label={tr("Footer", "ফুটার")} className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {l.label}
            </Link>
          ))}
        </nav>
        <p>© {new Date().getFullYear()} Hook AI</p>
      </div>
    </footer>
  );
}
