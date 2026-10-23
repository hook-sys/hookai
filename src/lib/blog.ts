import type { SupabaseClient } from "@supabase/supabase-js";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  category: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostSummary = Omit<BlogPost, "content">;

const SUMMARY_FIELDS =
  "id, slug, title, excerpt, cover_image_url, category, status, published_at, created_at, updated_at";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// শিরোনাম থেকে URL-এর অংশ। বাংলা শিরোনামে ইংরেজি অক্ষর না থাকলে তারিখভিত্তিক নাম।
export function slugify(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return slug || `post-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

// মোটামুটি পড়ার সময় (মিনিটে ২০০ শব্দ)
export function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function postState(p: Pick<BlogPost, "status" | "published_at">) {
  if (p.status === "draft") return "draft" as const;
  if (p.published_at && new Date(p.published_at) > new Date()) return "scheduled" as const;
  return "published" as const;
}

export function formatPostDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

// ---------- পাবলিক (RLS শুধু প্রকাশিত পোস্ট দেয়) ----------

export async function listPublishedPosts(supabase: SupabaseClient, category?: string) {
  let q = supabase.from("blog_posts").select(SUMMARY_FIELDS).order("published_at", { ascending: false });
  if (category) q = q.eq("category", category);
  const { data } = await q.limit(100);
  return (data ?? []) as BlogPostSummary[];
}

export async function getPublishedPost(supabase: SupabaseClient, slug: string) {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { data } = await supabase.from("blog_posts").select("*").eq("slug", slug).maybeSingle();
  return (data as BlogPost | null) ?? null;
}

// ---------- অ্যাডমিন (RLS অ্যাডমিনকে খসড়াসহ সব দেয়) ----------

export async function listAllPosts(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("blog_posts")
    .select(SUMMARY_FIELDS)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (data ?? []) as BlogPostSummary[];
}

export async function getPostById(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  return (data as BlogPost | null) ?? null;
}
