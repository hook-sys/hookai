import Link from "next/link";
import { Logo, LogoMark, buttonClass, cn } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";
import { getTr } from "@/lib/i18n-server";

// Header and footer for the public pages (landing, blog, legal)

// Page background for public pages. The parent needs `relative isolate`.
export function Backdrop() {
  return <div aria-hidden className="aurora pointer-events-none fixed inset-0 -z-10" />;
}

// tone="ink" sits on the landing page's dark hero; "paper" everywhere else
export async function SiteHeader({ loggedIn = false, tone = "paper" }: { loggedIn?: boolean; tone?: "paper" | "ink" }) {
  const tr = await getTr();
  const ink = tone === "ink";
  const nav = [
    { href: "/#tour", label: tr("Product", "প্রোডাক্ট") },
    { href: "/#how", label: tr("How it works", "কীভাবে কাজ করে") },
    { href: "/#pricing", label: tr("Pricing", "দাম") },
    { href: "/blog", label: tr("Blog", "ব্লগ") },
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md",
        ink ? "border-white/10 bg-[#0a0d14]/80 text-white" : "border-zinc-900/5 bg-[#f6f5f1]/85 dark:border-white/5 dark:bg-[#0b0d12]/85",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={tr("Hook AI home", "Hook AI হোম")} className="flex items-center gap-2.5">
          {ink ? (
            <>
              <LogoMark className="size-8" />
              <span className="text-sm font-bold tracking-wide">
                HOOK <span className="text-[#FF7A4D]">AI</span>
              </span>
            </>
          ) : (
            <>
              <span className="sm:hidden">
                <Logo compact />
              </span>
              <span className="hidden sm:block">
                <Logo />
              </span>
            </>
          )}
        </Link>
        <nav
          aria-label={tr("Main menu", "প্রধান মেনু")}
          className={cn("hidden items-center gap-7 text-sm md:flex", ink ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-300")}
        >
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={ink ? "hover:text-white" : "hover:text-zinc-950 dark:hover:text-white"}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitch className={ink ? "border-white/15 bg-white/5 [&_button[aria-pressed=false]]:text-zinc-300 [&_button[aria-pressed=true]]:bg-white [&_button[aria-pressed=true]]:text-zinc-900" : undefined} />
          {!loggedIn && (
            <Link
              href="/login"
              className={cn(
                "hidden rounded-lg px-3 py-2 text-sm font-medium sm:inline-flex",
                ink ? "text-zinc-200 hover:text-white" : "text-zinc-700 hover:text-zinc-950 dark:text-zinc-300",
              )}
            >
              {tr("Log in", "লগইন")}
            </Link>
          )}
          <Link
            href={loggedIn ? "/dashboard" : "/signup"}
            className={
              ink
                ? "inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                : buttonClass("primary", "rounded-lg")
            }
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
  const cols = [
    {
      title: tr("Product", "প্রোডাক্ট"),
      links: [
        { href: "/#tour", label: tr("Tour", "ট্যুর") },
        { href: "/#pricing", label: tr("Pricing", "দাম") },
        { href: "/signup", label: tr("Create account", "অ্যাকাউন্ট খোলো") },
        { href: "/login", label: tr("Log in", "লগইন") },
      ],
    },
    {
      title: tr("Learn", "জানো"),
      links: [
        { href: "/blog", label: tr("Blog", "ব্লগ") },
        { href: "/#faq", label: "FAQ" },
      ],
    },
    {
      title: tr("Legal", "আইনি"),
      links: [
        { href: "/privacy", label: tr("Privacy", "প্রাইভেসি") },
        { href: "/terms", label: tr("Terms", "শর্তাবলি") },
        { href: "/data-deletion", label: tr("Data deletion", "ডাটা মুছে ফেলা") },
      ],
    },
  ];
  return (
    <footer className="border-t border-zinc-900/5 bg-[#f6f5f1] dark:border-white/5 dark:bg-[#0b0d12]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            {tr(
              "Plain-language reports, alerts and advice for your Meta ads.",
              "তোমার Meta বিজ্ঞাপনের জন্য সহজ ভাষায় রিপোর্ট, অ্যালার্ট আর পরামর্শ।",
            )}
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-xs font-semibold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-500 dark:text-zinc-400">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-zinc-900/5 dark:border-white/5">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-400 sm:px-6">© {new Date().getFullYear()} Hook AI</p>
      </div>
    </footer>
  );
}
