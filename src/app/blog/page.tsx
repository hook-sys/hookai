import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { formatPostDate, listPublishedPosts } from "@/lib/blog";
import { Backdrop, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getTr } from "@/lib/i18n-server";
import { cn } from "@/components/ui";

// শিডিউল করা পোস্ট সময়মতো দেখাতে ৫ মিনিট পর পর নতুন করে তৈরি হয়
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Blog: Meta Ads tips",
  description: "Practical tips and guides on Facebook and Instagram ads, Pixel, budgets and creative.",
  alternates: { canonical: "/blog" },
};

type Props = { searchParams: Promise<{ cat?: string }> };

export default async function BlogIndexPage({ searchParams }: Props) {
  const { cat } = await searchParams;
  const tr = await getTr();
  const supabase = createPublicClient();
  const all = await listPublishedPosts(supabase);
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean) as string[])].sort();
  const posts = cat ? all.filter((p) => p.category === cat) : all;
  const [featured, ...rest] = posts;

  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{tr("Blog", "ব্লগ")}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {tr("Meta Ads tips, in plain words", "Meta Ads টিপস, সহজ বাংলায়")}
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            {tr("New posts on Pixel, budgets, creative and campaigns.", "Pixel, budget, creative আর campaign নিয়ে প্রতিদিন নতুন লেখা।")}
          </p>
        </div>

        {categories.length > 0 && (
          <nav aria-label={tr("Categories", "ক্যাটাগরি")} className="mb-8 flex flex-wrap gap-2">
            {[{ label: tr("All", "সব"), href: "/blog", active: !cat }, ...categories.map((c) => ({ label: c, href: `/blog?cat=${encodeURIComponent(c)}`, active: c === cat }))].map(
              (c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  aria-current={c.active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    c.active
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "glass border-white/60 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300",
                  )}
                >
                  {c.label}
                </Link>
              ),
            )}
          </nav>
        )}

        {!featured ? (
          <div className="glass rounded-3xl px-6 py-16 text-center">
            <Newspaper className="mx-auto size-8 text-zinc-400" aria-hidden />
            <p className="mt-3 font-medium text-zinc-900 dark:text-zinc-50">{tr("The first post is on its way", "শীঘ্রই প্রথম লেখা আসছে")}</p>
            <p className="mt-1 text-sm text-zinc-500">{tr("Fresh Meta Ads tips, regularly.", "প্রতিদিন Meta Ads নিয়ে নতুন টিপস থাকবে।")}</p>
          </div>
        ) : (
          <>
            <Link
              href={`/blog/${featured.slug}`}
              className="glass group mb-10 grid overflow-hidden rounded-3xl md:grid-cols-2"
            >
              {featured.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featured.cover_image_url} alt="" className="aspect-[1.91/1] h-full w-full object-cover" />
              ) : (
                <div className="aspect-[1.91/1] bg-gradient-to-br from-indigo-500 to-violet-700" />
              )}
              <div className="flex flex-col justify-center p-6 sm:p-8">
                {featured.category && (
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{featured.category}</p>
                )}
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 group-hover:text-indigo-600 sm:text-3xl dark:text-zinc-50 dark:group-hover:text-indigo-400">
                  {featured.title}
                </h2>
                {featured.excerpt && <p className="mt-3 text-zinc-600 dark:text-zinc-400">{featured.excerpt}</p>}
                <p className="mt-4 text-sm text-zinc-400">{formatPostDate(featured.published_at)}</p>
              </div>
            </Link>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="glass group flex flex-col overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
                >
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_image_url} alt="" loading="lazy" className="aspect-[1.91/1] w-full object-cover" />
                  ) : (
                    <div className="aspect-[1.91/1] bg-gradient-to-br from-indigo-400 to-violet-600" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    {p.category && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{p.category}</p>}
                    <h2 className="mt-1 font-semibold text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-50 dark:group-hover:text-indigo-400">
                      {p.title}
                    </h2>
                    {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{p.excerpt}</p>}
                    <p className="mt-auto pt-4 text-xs text-zinc-400">{formatPostDate(p.published_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
