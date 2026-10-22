import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdAccount, getCampaignInsightsDaily } from "@/lib/meta/graph";
import { pickLeads, pickPurchaseValue, pickPurchases } from "@/lib/metrics";

// এর চেয়ে পুরনো ডাটা হলে ড্যাশবোর্ড খোলার সময় নিজে থেকে আবার আনা হয়
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const UPSERT_CHUNK = 500;

// Meta থেকে গত ৩০ দিনের ক্যাম্পেইন ডাটা এনে ডাটাবেসে সংরক্ষণ করে।
// supabase ক্লায়েন্টটি ব্যবহারকারীর session-এর, তাই RLS নিজের সারিতেই সীমিত রাখে।
export async function syncInsights(
  supabase: SupabaseClient,
  userId: string,
  token: string,
  accountId: string,
) {
  const [account, rows] = await Promise.all([
    getAdAccount(token, accountId),
    getCampaignInsightsDaily(token, accountId),
  ]);

  const fetchedAt = new Date().toISOString();
  const records = rows.map((r) => ({
    user_id: userId,
    ad_account_id: accountId,
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
    const { error } = await supabase
      .from("ad_insights_daily")
      .upsert(records.slice(i, i + UPSERT_CHUNK), {
        onConflict: "user_id,ad_account_id,campaign_id,date",
      });
    if (error) throw new Error(`insights সংরক্ষণ ব্যর্থ: ${error.message}`);
  }

  const { error } = await supabase
    .from("meta_connections")
    .update({
      selected_ad_account_name: account.name,
      selected_ad_account_currency: account.currency,
      insights_synced_at: fetchedAt,
      updated_at: fetchedAt,
    })
    .eq("user_id", userId);
  if (error) throw new Error(`sync সময় সংরক্ষণ ব্যর্থ: ${error.message}`);

  return records.length;
}
