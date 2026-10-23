import type { ReactNode } from "react";
import Link from "next/link";
import Markdown from "@/components/Markdown";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE } from "@/lib/site";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "ডাটা মুছে ফেলা" },
];

// আইনি পেজের সাধারণ কাঠামো: শিরোনাম, হালনাগাদের তারিখ, অন্য আইনি পেজের লিংক, লেখা
export default function LegalPage({
  path,
  title,
  intro,
  body,
  before,
}: {
  path: string;
  title: string;
  intro: string;
  body: string;
  before?: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <nav aria-label="আইনি পেজ" className="mb-8 flex flex-wrap gap-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.href === path ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                l.href === path
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-400",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {before}
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">শেষ হালনাগাদ: {SITE.legalUpdated}</p>
        <p className="mt-6 text-lg text-zinc-700 dark:text-zinc-300">{intro}</p>
        <div className="mt-8">
          <Markdown>{body}</Markdown>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

// যোগাযোগের অংশ। ইমেইল সেট না থাকলে অ্যাপের ভেতরের ব্যবস্থার কথা বলে।
export function contactMarkdown() {
  return SITE.contactEmail
    ? `যেকোনো প্রশ্ন বা অনুরোধে ইমেইল করো: [${SITE.contactEmail}](mailto:${SITE.contactEmail})। আমরা সাধারণত ৭ দিনের মধ্যে উত্তর দিই।`
    : "যেকোনো প্রশ্ন বা অনুরোধে অ্যাপের ভেতর থেকে যোগাযোগ করো। নিজের ডাটা নিজেই সেটিংস থেকে মুছে ফেলতে পারো (নিচে দেখো)।";
}
