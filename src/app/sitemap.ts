import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { listPublishedPosts } from "@/lib/blog";

export const revalidate = 300;

// Google যেন ল্যান্ডিং পেজ ও সব প্রকাশিত ব্লগ পোস্ট খুঁজে পায়
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const posts = await listPublishedPosts(createPublicClient());
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
