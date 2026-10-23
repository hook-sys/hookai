import type { ReactNode } from "react";
import Link from "next/link";
import Markdown from "@/components/Markdown";
import { Backdrop, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE } from "@/lib/site";
import type { Tr } from "@/lib/i18n";
import { cn } from "@/components/ui";

// আইনি পেজের সাধারণ কাঠামো: শিরোনাম, হালনাগাদের তারিখ, অন্য আইনি পেজের লিংক, লেখা
export default function LegalPage({
  path,
  title,
  intro,
  body,
  before,
  tr,
}: {
  path: string;
  title: string;
  intro: string;
  body: string;
  before?: ReactNode;
  tr: Tr;
}) {
  const links = [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/data-deletion", label: tr("Data deletion", "ডাটা মুছে ফেলা") },
  ];
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <nav aria-label={tr("Legal pages", "আইনি পেজ")} className="mb-8 flex flex-wrap gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.href === path ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                l.href === path
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "glass border-white/60 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {before}
        <div className="glass rounded-3xl p-6 sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {tr("Last updated", "শেষ হালনাগাদ")}: {SITE.legalUpdated}
          </p>
          <p className="mt-6 text-lg text-zinc-700 dark:text-zinc-300">{intro}</p>
          <div className="mt-8">
            <Markdown>{body}</Markdown>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// যোগাযোগের অংশ। ইমেইল সেট না থাকলে অ্যাপের ভেতরের ব্যবস্থার কথা বলে।
export function contactMarkdown(tr: Tr) {
  return SITE.contactEmail
    ? tr(
        `For any question or request, email [${SITE.contactEmail}](mailto:${SITE.contactEmail}). We usually reply within 7 days.`,
        `যেকোনো প্রশ্ন বা অনুরোধে ইমেইল করো: [${SITE.contactEmail}](mailto:${SITE.contactEmail})। আমরা সাধারণত ৭ দিনের মধ্যে উত্তর দিই।`,
      )
    : tr(
        "For any question or request, contact us from inside the app. You can delete your own data yourself from Settings (see below).",
        "যেকোনো প্রশ্ন বা অনুরোধে অ্যাপের ভেতর থেকে যোগাযোগ করো। নিজের ডাটা নিজেই সেটিংস থেকে মুছে ফেলতে পারো (নিচে দেখো)।",
      );
}
