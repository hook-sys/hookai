"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { SLUG_PATTERN, slugify } from "@/lib/blog";
import { getTr } from "@/lib/i18n-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// প্রতিটি action নিজে অ্যাডমিন যাচাই করে; ডাটাবেসের RLS-ও অ্যাডমিন ছাড়া লিখতে দেয় না
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();
  return { supabase, user };
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export type SaveState = { error: string } | null;

function revalidateBlog(slugs: string[]) {
  revalidatePath("/blog");
  for (const s of slugs) revalidatePath(`/blog/${s}`);
  revalidatePath("/admin/blog");
  revalidatePath("/sitemap.xml");
}

export async function savePost(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, user } = await requireAdmin();
  const tr = await getTr();
  const duplicateSlug = tr("Another post already uses this URL. Pick a different one.", "এই URL অন্য পোস্টে আছে, আলাদা URL দাও।");
  const saveFailed = tr("Could not save.", "সংরক্ষণ করা যায়নি।");

  const id = text(formData, "id");
  const title = text(formData, "title");
  const slug = text(formData, "slug") || slugify(title);
  const excerpt = text(formData, "excerpt");
  const content = String(formData.get("content") ?? "");
  const coverImageUrl = text(formData, "cover_image_url");
  const category = text(formData, "category");
  const status = text(formData, "status") === "published" ? "published" : "draft";
  const publishedAtRaw = text(formData, "published_at");

  if (!title) return { error: tr("Add a title.", "শিরোনাম দাও।") };
  if (title.length > 200) return { error: tr("Keep the title under 200 characters.", "শিরোনাম ২০০ অক্ষরের মধ্যে রাখো।") };
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) {
    return { error: tr("Use only lowercase letters, numbers and hyphens in the URL (e.g. pixel-setup-guide).", "URL শুধু ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে লেখো (যেমন pixel-setup-guide)।") };
  }
  if (excerpt.length > 400) return { error: tr("Keep the excerpt under 400 characters.", "সারাংশ ৪০০ অক্ষরের মধ্যে রাখো।") };
  if (coverImageUrl && !/^https:\/\//.test(coverImageUrl)) return { error: tr("The cover image link must start with https.", "কভার ছবির লিংক https দিয়ে শুরু হতে হবে।") };
  if (category.length > 60) return { error: tr("Keep the category short.", "ক্যাটাগরি ছোট রাখো।") };

  // প্রকাশের সময়: না দিলে এখন; ভবিষ্যতের সময় দিলে সেই সময়ে নিজে থেকে প্রকাশ হবে
  let publishedAt: string | null = null;
  if (status === "published") {
    const d = publishedAtRaw ? new Date(publishedAtRaw) : new Date();
    if (Number.isNaN(d.getTime())) return { error: tr("That publish time is not valid.", "প্রকাশের সময় সঠিক নয়।") };
    publishedAt = d.toISOString();
  }

  const fields = {
    slug,
    title,
    excerpt: excerpt || null,
    content,
    cover_image_url: coverImageUrl || null,
    category: category || null,
    status,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };

  let oldSlug: string | null = null;
  let savedId = id;
  if (id) {
    if (!UUID_PATTERN.test(id)) notFound();
    const { data: old } = await supabase.from("blog_posts").select("slug").eq("id", id).maybeSingle();
    oldSlug = old?.slug ?? null;
    const { error } = await supabase.from("blog_posts").update(fields).eq("id", id);
    if (error) return { error: error.code === "23505" ? duplicateSlug : saveFailed };
  } else {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({ ...fields, author_id: user.id })
      .select("id")
      .single();
    if (error || !data) {
      return { error: error?.code === "23505" ? duplicateSlug : saveFailed };
    }
    savedId = data.id;
  }

  revalidateBlog([slug, ...(oldSlug && oldSlug !== slug ? [oldSlug] : [])]);
  redirect(`/admin/blog/${savedId}?saved=1`);
}

const BUCKET_MARKER = "/storage/v1/object/public/blog-images/";

// পোস্টে ব্যবহৃত আমাদের নিজেদের আপলোড করা ছবির পথ (কভার ও লেখার ভেতরের)
function ownImagePaths(...texts: (string | null)[]) {
  const paths = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const part of t.split(BUCKET_MARKER).slice(1)) {
      const path = part.match(/^[A-Za-z0-9/_.-]+/)?.[0];
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

export async function deletePost(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = text(formData, "id");
  if (!UUID_PATTERN.test(id)) notFound();

  const { data } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id)
    .select("slug, cover_image_url, content")
    .maybeSingle();

  // অন্য কোনো পোস্টে ব্যবহার না হলে ছবিগুলোও মুছে ফেলা হয়, যাতে storage-এ অকেজো ফাইল না জমে
  if (data) {
    const candidates = ownImagePaths(data.cover_image_url, data.content);
    const unused: string[] = [];
    for (const path of candidates) {
      const { count } = await supabase
        .from("blog_posts")
        .select("id", { count: "exact", head: true })
        .or(`cover_image_url.ilike.%${path}%,content.ilike.%${path}%`);
      if (!count) unused.push(path);
    }
    if (unused.length > 0) {
      const { error } = await supabase.storage.from("blog-images").remove(unused);
      if (error) console.error("blog image cleanup failed", error.message);
    }
  }

  revalidateBlog(data?.slug ? [data.slug] : []);
  redirect("/admin/blog?deleted=1");
}

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadResult = { url: string } | { error: string };

// ছবি Supabase Storage-এ যায়; পাবলিক লিংক ফেরত দেয়
export async function uploadBlogImage(formData: FormData): Promise<UploadResult> {
  const { supabase } = await requireAdmin();
  const tr = await getTr();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: tr("Choose an image.", "ছবি বেছে নাও।") };

  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: tr("Only PNG, JPG, WebP or GIF images.", "শুধু PNG, JPG, WebP বা GIF ছবি দেওয়া যাবে।") };
  if (file.size > MAX_IMAGE_BYTES) return { error: tr("Images must be under 5 MB.", "ছবি ৫ MB-এর কম হতে হবে।") };

  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("blog-images")
    .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: tr("Could not upload the image.", "ছবি আপলোড করা যায়নি।") };

  return { url: supabase.storage.from("blog-images").getPublicUrl(path).data.publicUrl };
}
