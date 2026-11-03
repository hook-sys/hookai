import type { SupabaseClient } from "@supabase/supabase-js";
import { createPagePost, readyMediaUrl, UnknownOutcomeError, type PagePostMedia } from "./pagePublish";
import { PublishError } from "./pagePosts";

// জমা থাকা (approved) পোস্ট প্রকাশের একটাই পথ — হাতে Publish now হোক বা cron, দুটোই এখান দিয়ে যায়।
// claim আগে হয় (publishing), তাই একই পোস্ট দুইবার যায় না; ব্যর্থতায় কখনো নিজে থেকে retry হয় না।

export type StoredPagePost = {
  id: string;
  page_id: string;
  kind: "text" | "photo" | "video";
  caption: string;
  media: PagePostMedia[];
  status: string;
  approved_at: string | null;
};

type MarkFn = (status: "published" | "failed", fbPostId: string | null, permalink: string | null, error: string | null) => Promise<void>;

export async function publishStoredPagePost(args: {
  token: string;
  row: StoredPagePost;
  // লগইন করা ব্যবহারকারীর client থাকলে storage-এর signed URL তখনই বানানো যায়;
  // cron-এ থাকে না — সেখানে approve-এর সময় বানিয়ে রাখা লিংক বা Drive লিংক লাগে।
  supabase: SupabaseClient | null;
  claim: () => Promise<boolean>;
  mark: MarkFn;
}): Promise<{ published: boolean; skipped?: boolean; error?: string }> {
  const { token, row, supabase, claim, mark } = args;
  if (!row.approved_at) return { published: false, skipped: true, error: "not approved" };
  if (!(await claim())) return { published: false, skipped: true };

  const resolveUrl = async (item: PagePostMedia): Promise<string> => {
    const ready = readyMediaUrl(item);
    if (ready) return ready;
    if (supabase && !item.path.startsWith("drive:")) {
      const { data, error } = await supabase.storage.from("ad-media").createSignedUrl(item.path, 60 * 60);
      if (!error && data) return data.signedUrl;
    }
    throw new PublishError("The media link expired. Approve the post again to refresh it, then publish.");
  };

  try {
    const r = await createPagePost(token, row, resolveUrl);
    await mark("published", r.fbPostId, r.permalink, null);
    return { published: true };
  } catch (err) {
    const message =
      err instanceof UnknownOutcomeError || err instanceof PublishError || err instanceof Error
        ? err.message
        : "Meta API error";
    await mark("failed", null, null, message.slice(0, 1000));
    return { published: false, error: message };
  }
}

// approve-এর সময় storage মিডিয়ার দীর্ঘমেয়াদি signed লিংক বানিয়ে সারিতে রেখে দেওয়া,
// যাতে পরে cron (যার storage অ্যাক্সেস নেই) সেটা দিয়ে প্রকাশ করতে পারে।
const SIGNED_URL_SECONDS = 60 * 24 * 60 * 60; // ৬০ দিন

export async function withFreshMediaUrls(supabase: SupabaseClient, media: PagePostMedia[]): Promise<PagePostMedia[]> {
  const out: PagePostMedia[] = [];
  for (const item of media) {
    if (item.path.startsWith("drive:")) {
      out.push(item);
      continue;
    }
    const { data, error } = await supabase.storage.from("ad-media").createSignedUrl(item.path, SIGNED_URL_SECONDS);
    if (error || !data) {
      out.push(item);
      continue;
    }
    out.push({ ...item, url: data.signedUrl, url_expires_at: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString() });
  }
  return out;
}
