"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { currentClient } from "@/lib/clients";
import { pagePostsAllowed } from "@/lib/pagePostsAccess";
import { driveFileInfo, parseDriveLink, DriveError } from "@/lib/meta/launchSources";
import { listUserPages, type PagePostKind, type PagePostMedia } from "@/lib/meta/pagePublish";
import { publishStoredPagePost, withFreshMediaUrls, type StoredPagePost } from "@/lib/meta/pagePublishRun";

export type PagePostState = { ok: true; message: string } | { ok: false; error: string } | null;

export type PagePostItem = {
  id: string;
  page_id: string;
  page_name: string | null;
  kind: PagePostKind;
  caption: string;
  media: PagePostMedia[];
  status: "draft" | "approved" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at: string | null;
  approved_at: string | null;
  fb_post_id: string | null;
  permalink: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
};

const PAGE_ID = /^\d{5,25}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_CAPTION = 5000;

type Tr = (en: string, bn: string) => string;

type ContextOk = { tr: Tr; supabase: SupabaseClient; user: { id: string }; token: string };

async function context(): Promise<ContextOk | { error: string }> {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!pagePostsAllowed(user.email)) {
    return { error: tr("Page posts isn't available for this account yet.", "এই অ্যাকাউন্টে পেজ পোস্ট এখনো চালু হয়নি।") } as const;
  }
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.access_token_encrypted) {
    return { error: tr("Connect Facebook in Settings first.", "আগে সেটিংস থেকে Facebook কানেক্ট করো।") } as const;
  }
  return { tr, supabase, user, token: decrypt(c.access_token_encrypted) };
}

// Meta-র permission এররের পরিচিত বার্তাটা বাংলায় দেখানো (manage-এর publishPost-এর মতো)
function localizePublishError(message: string, tr: Tr): string {
  if (message.startsWith("Facebook hasn't")) {
    return tr(message, "Facebook এখনো Hook-কে পোস্ট প্রকাশের অনুমতি দেয়নি। সেটিংস থেকে Facebook আবার কানেক্ট করে পেজের পোস্ট পরিচালনার অনুমতি দাও।");
  }
  return message;
}

// datetime-local-এর লেখা Asia/Dhaka সময় ধরে UTC-তে বদলানো (ঢাকায় DST নেই, সবসময় UTC+6)
function parseSchedule(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const when = new Date(Date.UTC(y, mo - 1, d, h - 6, mi));
  return Number.isNaN(when.getTime()) ? null : when;
}

async function loadRow(supabase: SupabaseClient, userId: string, id: string) {
  const { data } = await supabase.from("page_posts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data ?? null) as PagePostItem | null;
}

// ---------- খসড়া তৈরি ----------

export async function createPagePostDraft(_prev: PagePostState, formData: FormData): Promise<PagePostState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { tr, supabase, user, token } = ctx;

  const pageId = String(formData.get("page_id") ?? "");
  if (!PAGE_ID.test(pageId)) return { ok: false, error: tr("Pick a Facebook page.", "একটা Facebook পেজ বাছো।") };
  const caption = String(formData.get("caption") ?? "").trim().slice(0, MAX_CAPTION);

  // মিডিয়া: আপলোডের JSON, নয়তো Drive লিংক — দুটোর একটা
  let media: PagePostMedia[] = [];
  try {
    const raw = JSON.parse(String(formData.get("media") ?? "[]")) as { path?: unknown; kind?: unknown; name?: unknown }[];
    media = raw.slice(0, 1).map((m) => ({
      path: String(m.path ?? ""),
      kind: m.kind === "video" ? ("video" as const) : ("image" as const),
      name: String(m.name ?? "media").slice(0, 100),
    }));
  } catch {
    media = [];
  }
  for (const m of media) {
    const okPath = m.path.startsWith("drive:")
      ? /^[\w-]{10,}$/.test(m.path.slice("drive:".length))
      : m.path.startsWith(`${user.id}/posts/`) && !m.path.includes("..");
    if (!okPath) return { ok: false, error: tr("Invalid upload.", "ভুল আপলোড।") };
  }
  if (media.length === 0) {
    const link = String(formData.get("drive_link") ?? "").trim();
    if (link) {
      const parsed = parseDriveLink(link);
      if (!parsed || parsed.folder) {
        return { ok: false, error: tr("Paste a single file's Drive link, not a folder.", "ফোল্ডারের নয়, একটা ফাইলের Drive লিংক দাও।") };
      }
      try {
        const f = await driveFileInfo(parsed.id);
        media = [{ path: `drive:${f.id}`, kind: f.kind === "video" ? "video" : "image", name: f.name }];
      } catch (err) {
        return { ok: false, error: err instanceof DriveError ? err.message : tr("Couldn't read that Drive link.", "ওই Drive লিংকটা পড়া যায়নি।") };
      }
    }
  }

  const kind: PagePostKind = media.length === 0 ? "text" : media[0].kind === "video" ? "video" : "photo";
  if (kind === "text" && caption.length === 0) {
    return { ok: false, error: tr("Write the post text, or add an image or video.", "পোস্টের লেখা লেখো, নয়তো ছবি বা ভিডিও দাও।") };
  }

  // পেজ সত্যিই তালিকায় আছে কিনা (তালিকা পাওয়া গেলে); নাম সার্ভার থেকেই নেওয়া হয়
  let pageName = String(formData.get("page_name") ?? "").slice(0, 200);
  const pages = await listUserPages(token).catch(() => null);
  if (pages) {
    const hit = pages.find((p) => p.id === pageId);
    if (!hit) return { ok: false, error: tr("Pick a page from the list.", "তালিকা থেকে একটা পেজ বাছো।") };
    pageName = hit.name;
  }

  let scheduledAt: string | null = null;
  const scheduleRaw = String(formData.get("scheduled_at") ?? "").trim();
  if (scheduleRaw) {
    const when = parseSchedule(scheduleRaw);
    if (!when || when.getTime() <= Date.now()) {
      return { ok: false, error: tr("Pick a schedule time in the future.", "ভবিষ্যতের একটা শিডিউল সময় বাছো।") };
    }
    scheduledAt = when.toISOString();
  }

  const { client } = await currentClient(supabase, user.id);
  const { error } = await supabase.from("page_posts").insert({
    user_id: user.id,
    client_id: client?.id ?? null,
    page_id: pageId,
    page_name: pageName || null,
    kind,
    caption,
    media,
    status: "draft",
    scheduled_at: scheduledAt,
  });
  if (error) return { ok: false, error: tr("Couldn't save the draft.", "খসড়াটা রাখা যায়নি।") };
  revalidatePath("/page-posts");
  return {
    ok: true,
    message: tr("Saved as a draft. Nothing publishes until you approve it.", "খসড়া হিসেবে রাখা হয়েছে। তুমি approve না করলে কিছুই প্রকাশ হবে না।"),
  };
}

// ---------- approve ----------

export async function approvePagePost(_prev: PagePostState, formData: FormData): Promise<PagePostState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { tr, supabase, user } = ctx;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  const row = await loadRow(supabase, user.id, id);
  if (!row) return { ok: false, error: tr("Post not found.", "পোস্টটা পাওয়া যায়নি।") };
  if (row.status !== "draft") return { ok: false, error: tr("Only drafts can be approved.", "শুধু খসড়া approve করা যায়।") };

  // cron যেন পরে storage মিডিয়া পৌঁছাতে পারে, তাই এখনই দীর্ঘমেয়াদি signed লিংক বানিয়ে রাখা
  const media = await withFreshMediaUrls(supabase, row.media);
  const { data, error } = await supabase
    .from("page_posts")
    .update({
      status: row.scheduled_at ? "scheduled" : "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      media,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error || !data?.length) return { ok: false, error: tr("Couldn't approve this post.", "পোস্টটা approve করা যায়নি।") };
  revalidatePath("/page-posts");
  return {
    ok: true,
    message: row.scheduled_at
      ? tr("Approved. Hook will publish it at the scheduled time.", "Approve হয়েছে। শিডিউলের সময় হলে Hook প্রকাশ করবে।")
      : tr("Approved. You can publish it now.", "Approve হয়েছে। এখন প্রকাশ করতে পারো।"),
  };
}

// ---------- প্রকাশ (Publish now / Retry) ----------

async function publishRow(ctx: ContextOk, id: string, from: ("approved" | "scheduled" | "failed")[]) {
  const { tr, supabase, user, token } = ctx;
  const row = await loadRow(supabase, user.id, id);
  if (!row) return { ok: false, error: tr("Post not found.", "পোস্টটা পাওয়া যায়নি।") } as const;
  if (!from.includes(row.status as (typeof from)[number])) {
    return { ok: false, error: tr("This post can't be published from its current state.", "এই অবস্থায় পোস্টটা প্রকাশ করা যায় না।") } as const;
  }
  if (!row.approved_at) {
    return { ok: false, error: tr("Approve the post first — nothing publishes without approval.", "আগে পোস্টটা approve করো — অনুমোদন ছাড়া কিছুই প্রকাশ হয় না।") } as const;
  }

  const stored: StoredPagePost = {
    id: row.id,
    page_id: row.page_id,
    kind: row.kind,
    caption: row.caption,
    media: row.media,
    status: row.status,
    approved_at: row.approved_at,
  };
  const result = await publishStoredPagePost({
    token,
    row: stored,
    supabase,
    claim: async () => {
      const { data } = await supabase
        .from("page_posts")
        .update({ status: "publishing", error: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", from)
        .not("approved_at", "is", null)
        .select("id");
      return Boolean(data?.length);
    },
    mark: async (status, fbPostId, permalink, error) => {
      await supabase
        .from("page_posts")
        .update({
          status,
          fb_post_id: fbPostId,
          permalink,
          error,
          published_at: status === "published" ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    },
  });
  revalidatePath("/page-posts");
  if (result.published) return { ok: true, message: tr("Published on the page.", "পেজে প্রকাশ হয়েছে।") } as const;
  if (result.skipped) return { ok: false, error: tr("This post is already being published or was published.", "এই পোস্টটা ইতিমধ্যে প্রকাশ হচ্ছে বা হয়ে গেছে।") } as const;
  return { ok: false, error: result.error ? localizePublishError(result.error, tr) : tr("Publishing failed.", "প্রকাশ করা যায়নি।") } as const;
}

export async function publishPagePostNow(_prev: PagePostState, formData: FormData): Promise<PagePostState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: ctx.tr("Invalid request.", "ভুল অনুরোধ।") };
  return publishRow(ctx, id, ["approved", "scheduled"]);
}

export async function retryPagePost(_prev: PagePostState, formData: FormData): Promise<PagePostState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: ctx.tr("Invalid request.", "ভুল অনুরোধ।") };
  return publishRow(ctx, id, ["failed"]);
}

// ---------- মুছে ফেলা ----------

export async function deletePagePost(_prev: PagePostState, formData: FormData): Promise<PagePostState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { tr, supabase, user } = ctx;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  const row = await loadRow(supabase, user.id, id);
  if (!row) return { ok: false, error: tr("Post not found.", "পোস্টটা পাওয়া যায়নি।") };
  if (row.status !== "draft" && row.status !== "failed") {
    return { ok: false, error: tr("Only drafts and failed posts can be deleted.", "শুধু খসড়া আর ব্যর্থ পোস্ট মোছা যায়।") };
  }
  const { error } = await supabase.from("page_posts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: tr("Couldn't delete this post.", "পোস্টটা মোছা যায়নি।") };
  const paths = row.media.map((m) => m.path).filter((p) => !p.startsWith("drive:"));
  if (paths.length) await supabase.storage.from("ad-media").remove(paths);
  revalidatePath("/page-posts");
  return { ok: true, message: tr("Deleted.", "মুছে ফেলা হয়েছে।") };
}
