import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdAccount, getCampaignInsightsDaily } from "@/lib/meta/graph";
import { pickLeads, pickPurchaseValue, pickPurchases } from "@/lib/metrics";
import { evaluateAndStoreAlerts } from "@/lib/alerts/store";
import { addDays, todayIn } from "@/lib/dates";

// গত ৩০ দিনের ডাটা এর চেয়ে পুরনো হলে আবার আনা হয় (Meta পরে কনভার্শন যোগ করতে পারে)
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
// আজ বা গতকাল দেখলে এর চেয়ে পুরনো হলে শুধু এই দুই দিন আবার আনা হয়
export const TODAY_STALE_MS = 15 * 60 * 1000;

const RECENT_WINDOW_DAYS = 30;
// Meta-কে এক অনুরোধে বেশি লম্বা সময় দিলে ব্যর্থ হতে পারে, তাই ভাগ করে আনা হয়
const CHUNK_DAYS = 90;
const UPSERT_CHUNK = 500;

export type SyncContext = {
  supabase: SupabaseClient;
  userId: string;
  token: string;
  accountId: string;
};

// since থেকে until পর্যন্ত (দুই দিনসহ) Meta থেকে এনে ডাটাবেসে রাখে
async function upsertRange(ctx: SyncContext, since: string, until: string) {
  let count = 0;
  for (let start = since; start <= until; start = addDays(start, CHUNK_DAYS)) {
    const end = addDays(start, CHUNK_DAYS - 1) < until ? addDays(start, CHUNK_DAYS - 1) : until;
    const rows = await getCampaignInsightsDaily(ctx.token, ctx.accountId, { since: start, until: end });

    const fetchedAt = new Date().toISOString();
    const records = rows.map((r) => ({
      user_id: ctx.userId,
      ad_account_id: ctx.accountId,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      date: r.date_start,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      purchases: pickPurchases(r.actions),
      purchase_value: pickPurchaseValue(r.action_values),
      leads: pickLeads(r.actions),
      fetched_at: fetchedAt,
    }));

    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      const { error } = await ctx.supabase
        .from("ad_insights_daily")
        .upsert(records.slice(i, i + UPSERT_CHUNK), {
          onConflict: "user_id,ad_account_id,campaign_id,date",
        });
      if (error) throw new Error(`Saving insights failed: ${error.message}`);
    }
    count += records.length;
  }
  return count;
}

async function updateConnection(ctx: SyncContext, fields: Record<string, unknown>) {
  const { error } = await ctx.supabase
    .from("meta_connections")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`Saving sync info failed: ${error.message}`);
}

// নিয়মিত আপডেট: গত ৩০ দিন ও আজ, সাথে Ad Account-এর নাম, মুদ্রা ও টাইমজোন
export async function syncRecent(ctx: SyncContext, syncedFrom: string | null) {
  const account = await getAdAccount(ctx.token, ctx.accountId);
  const today = todayIn(account.timezone_name);
  const since = addDays(today, -RECENT_WINDOW_DAYS);

  const count = await upsertRange(ctx, since, today);

  const now = new Date().toISOString();
  await updateConnection(ctx, {
    selected_ad_account_name: account.name,
    selected_ad_account_currency: account.currency,
    selected_ad_account_timezone: account.timezone_name,
    insights_synced_at: now,
    insights_today_synced_at: now,
    // আগে আরও পুরনো ডাটা আনা থাকলে সেই শুরুর তারিখই থাকে
    insights_synced_from: syncedFrom && syncedFrom < since ? syncedFrom : since,
  });

  // নতুন ডাটা এলেই অ্যালার্ট যাচাই; ব্যর্থ হলেও sync সফল ধরা হয়
  try {
    await evaluateAndStoreAlerts(
      ctx.supabase,
      ctx.userId,
      ctx.accountId,
      account.currency,
      account.timezone_name,
    );
  } catch (err) {
    console.error("alert evaluation failed", err instanceof Error ? err.message : err);
  }

  return { count, account };
}

// আজ ও গতকাল দিনের মধ্যে বারবার বদলায়; শুধু এই দুই দিন দ্রুত আপডেট
export async function syncToday(ctx: SyncContext, timeZone: string | null) {
  const today = todayIn(timeZone);
  await upsertRange(ctx, addDays(today, -1), today);
  await updateConnection(ctx, { insights_today_synced_at: new Date().toISOString() });
}

// ব্যবহারকারী পুরনো তারিখ বাছলে, ডাটাবেসে না থাকা অংশটুকু Meta থেকে আনে
export async function ensureCoverage(
  ctx: SyncContext,
  from: string,
  syncedFrom: string | null,
  timeZone: string | null,
) {
  if (syncedFrom && from >= syncedFrom) return false;
  const until = syncedFrom ? addDays(syncedFrom, -1) : todayIn(timeZone);
  await upsertRange(ctx, from, until);
  await updateConnection(ctx, { insights_synced_from: from });
  return true;
}
