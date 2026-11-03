import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { decrypt } from "@/lib/crypto";
import { pagePostsAllowed } from "@/lib/pagePostsAccess";
import { publishStoredPagePost, type StoredPagePost } from "@/lib/meta/pagePublishRun";
import type { PagePostKind, PagePostMedia } from "@/lib/meta/pagePublish";

// শিডিউল হয়ে যাওয়া, approve করা Page পোস্ট প্রকাশ। pg_cron প্রতি ১৫ মিনিটে ডাকে (0039 মাইগ্রেশন)।
// গোপন key যাচাই হয় ডাটাবেসে (cron_check, 0031-এর মতো); key ভুল হলে RPC কোনো ডাটা দেয় না।
// approve ছাড়া (approved_at নেই) কোনো পোস্ট এখান দিয়েও প্রকাশ হয় না।
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type DuePost = {
  id: string;
  user_id: string;
  user_email: string | null;
  token: string;
  page_id: string;
  page_name: string | null;
  kind: PagePostKind;
  caption: string;
  media: PagePostMedia[];
  scheduled_at: string;
  approved_at: string;
};

export async function POST(request: NextRequest) {
  const got = request.headers.get("x-cron-secret") ?? "";
  if (!/^[0-9a-f]{64}$/.test(got)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("cron_page_posts_due", { p_secret: got });
  if (error) {
    if (/unauthorized/i.test(error.message)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error("cron page posts snapshot failed", error.message);
    return NextResponse.json({ error: "snapshot" }, { status: 500 });
  }

  const mark = async (id: string, status: "publishing" | "published" | "failed", fbPostId: string | null = null, permalink: string | null = null, err: string | null = null) => {
    const { data: ok } = await supabase.rpc("cron_page_posts_mark", {
      p_secret: got,
      p_id: id,
      p_status: status,
      p_fb_post_id: fbPostId,
      p_permalink: permalink,
      p_error: err,
    });
    return Boolean(ok);
  };

  let published = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of (data ?? []) as DuePost[]) {
    // ফিচারটা আপাতত allowlist-এর অ্যাকাউন্টগুলোর জন্যই; বাকিদের পোস্ট ছোঁয়া হয় না
    if (!pagePostsAllowed(p.user_email)) {
      skipped++;
      continue;
    }
    try {
      const row: StoredPagePost = {
        id: p.id,
        page_id: p.page_id,
        kind: p.kind,
        caption: p.caption,
        media: p.media ?? [],
        status: "scheduled",
        approved_at: p.approved_at, // RPC শুধু approved_at থাকা পোস্টই ফেরত দেয়; claim-ও আবার যাচাই করে
      };
      const r = await publishStoredPagePost({
        token: decrypt(p.token),
        row,
        supabase: null, // cron-এ storage অ্যাক্সেস নেই: approve-এর সময় রাখা signed লিংক বা Drive লিংক ব্যবহৃত হয়
        claim: () => mark(p.id, "publishing"),
        mark: async (status, fbPostId, permalink, err) => {
          await mark(p.id, status, fbPostId, permalink, err);
        },
      });
      if (r.published) published++;
      else if (r.skipped) skipped++;
      else failed++;
    } catch (err) {
      failed++;
      console.error("cron page post failed", p.id, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, published, failed, skipped });
}
