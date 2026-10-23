import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { formatPostDate, getPublishedPost, listPublishedPosts, readingMinutes } from "@/lib/blog";
import Markdown from "@/components/Markdown";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { LogoMark } from "@/components/ui";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

// Google ও Facebook-এ শেয়ার করলে শিরোনাম, বর্ণনা ও কভার ছবি দেখায়
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(createPublicClient(), slug);
  if (!post) return { title: "পোস্ট পাওয়া যায়নি" };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: post.published_at ?? undefined,
      images: post.cover_image_url ? [{ url: post.cover_image_url, width: 1200, height: 630 }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createPublicClient();
  const post = await getPublishedPost(supabase, slug);
  if (!post) notFound();

  const related = (await listPublishedPosts(supabase, post.category ?? undefined))
    .filter((p) => p.id !== post.id)
    .slice(0, 3);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_image_url ?? undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    inLanguage: "bn",
    publisher: { "@type": "Organization", name: "Hook AI", logo: { "@type": "ImageObject", url: `${siteUrl}/icon.svg` } },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
  };

  return (
    <div className="bg-white dark:bg-zinc-950">
      <SiteHeader />
      <script
        type="application/ld+json"
        // JSON.stringify নিরাপদ; < চিহ্ন বদলে দেওয়া হয় যাতে script ট্যাগ ভাঙতে না পারে
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="size-4" aria-hidden />
          সব লেখা
        </Link>

        <article className="mt-6">
          {post.category && (
            <Link
              href={`/blog?cat=${encodeURIComponent(post.category)}`}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
            >
              {post.category}
            </Link>
          )}
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {post.title}
          </h1>
          <p className="mt-4 flex items-center gap-3 text-sm text-zinc-500">
            <span>{formatPostDate(post.published_at)}</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {readingMinutes(post.content)} মিনিটে পড়া
            </span>
          </p>
          {post.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_image_url} alt="" className="mt-8 aspect-[1.91/1] w-full rounded-2xl object-cover" />
          )}
          <div className="mt-10">
            <Markdown>{post.content}</Markdown>
          </div>
        </article>

        {/* প্রতিটি লেখার শেষে অ্যাপে আনার জন্য */}
        <aside className="mt-14 flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-800 px-6 py-10 text-center text-white sm:flex-row sm:text-left">
          <LogoMark className="size-12 shrink-0 rounded-xl ring-2 ring-white/30" />
          <div className="flex-1">
            <p className="text-lg font-semibold">তোমার বিজ্ঞাপনে কোথায় টাকা নষ্ট হচ্ছে?</p>
            <p className="mt-1 text-sm text-indigo-100">Hook AI ফ্রিতে তোমার campaign বিশ্লেষণ করে বাংলায় বলে দেবে।</p>
          </div>
          <Link
            href="/login"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            ফ্রি শুরু করো
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </aside>

        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">আরও পড়ো</h2>
            <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {related.map((p) => (
                <li key={p.id}>
                  <Link href={`/blog/${p.slug}`} className="group block py-3">
                    <span className="font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
                      {p.title}
                    </span>
                    <span className="block text-xs text-zinc-400">{formatPostDate(p.published_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
