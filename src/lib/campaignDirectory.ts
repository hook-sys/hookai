import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdAccounts, graphGetAll } from "@/lib/meta/graph";

// সব Ad Account-এর ক্যাম্পেইনের নাম ও কোন অ্যাকাউন্টের, Meta থেকে এনে জমা রাখা।
// অচেনা ক্যাম্পেইন ID দেখা দিলে তবেই আবার আনা হয়, আর সেটাও ঘণ্টায় একবারের বেশি নয়।

export type DirectoryEntry = { name: string; accountId: string; accountName: string | null };

const REFRESH_AFTER_MS = 60 * 60 * 1000;
const MAX_ACCOUNTS = 40;

async function readDirectory(supabase: SupabaseClient, userId: string) {
  const map = new Map<string, DirectoryEntry>();
  let newest = 0;
  for (let from = 0; from < 50_000; from += 1000) {
    const { data } = await supabase
      .from("campaign_directory")
      .select("campaign_id, name, ad_account_id, ad_account_name, updated_at")
      .eq("user_id", userId)
      .order("campaign_id", { ascending: true })
      .range(from, from + 999);
    for (const r of data ?? []) {
      map.set(r.campaign_id, { name: r.name, accountId: r.ad_account_id, accountName: r.ad_account_name });
      newest = Math.max(newest, new Date(r.updated_at).getTime());
    }
    if (!data || data.length < 1000) break;
  }
  return { map, newest };
}

export async function campaignDirectory(
  supabase: SupabaseClient,
  userId: string,
  token: string | null,
  neededIds: Iterable<string>,
) {
  const { map, newest } = await readDirectory(supabase, userId);
  const missing = [...new Set(neededIds)].filter((id) => !map.has(id));
  if (missing.length === 0 || !token || Date.now() - newest < REFRESH_AFTER_MS) return map;

  try {
    const accounts = (await getAdAccounts(token)).slice(0, MAX_ACCOUNTS);
    const now = new Date().toISOString();
    const rows: { user_id: string; campaign_id: string; name: string; ad_account_id: string; ad_account_name: string; updated_at: string }[] = [];
    await Promise.all(
      accounts.map(async (a) => {
        try {
          const campaigns = await graphGetAll<{ id: string; name: string }>(
            `/${a.id}/campaigns`,
            { fields: "id,name", limit: "500" },
            token,
            10,
          );
          for (const c of campaigns) {
            rows.push({ user_id: userId, campaign_id: c.id, name: c.name, ad_account_id: a.id, ad_account_name: a.name, updated_at: now });
            map.set(c.id, { name: c.name, accountId: a.id, accountName: a.name });
          }
        } catch (err) {
          // একটা অ্যাকাউন্টে সমস্যা হলে বাকিগুলো চলুক
          console.error("campaign list failed", a.id, err instanceof Error ? err.message : err);
        }
      }),
    );
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("campaign_directory").upsert(rows.slice(i, i + 500), { onConflict: "user_id,campaign_id" });
    }
    // কিছু না পেলেও সময়টা মনে রাখা, যাতে প্রতিবার Meta-কে জিজ্ঞেস না করে
    if (rows.length === 0 && missing.length > 0) {
      await supabase
        .from("campaign_directory")
        .upsert(
          { user_id: userId, campaign_id: "_checked", name: "", ad_account_id: "", updated_at: now },
          { onConflict: "user_id,campaign_id" },
        );
    }
  } catch (err) {
    console.error("campaign directory refresh failed", err instanceof Error ? err.message : err);
  }
  return map;
}
