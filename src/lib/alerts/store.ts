import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/format";
import { addDays, todayIn } from "@/lib/dates";
import { loadDailyRows } from "@/lib/insights/report";
import { BASELINE_DAYS, RECENT_DAYS, evaluateAll, type Severity } from "./rules";

export type StoredAlert = {
  id: string;
  campaign_name: string | null;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  data: Record<string, number | null> | null;
  alert_date: string;
};

// জমা থাকা ডাটা থেকে অ্যালার্ট খুঁজে সংরক্ষণ করে। একই দিনের একই অ্যালার্ট আবার যোগ হয় না,
// তাই ব্যবহারকারী "দেখেছি" চাপলে সেটি আর ফিরে আসে না।
// দিনগুলো Ad Account-এর টাইমজোনে গোনা হয়; আজকের অসম্পূর্ণ দিন বাদ।
export async function evaluateAndStoreAlerts(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  currency: string | null,
  timeZone: string | null,
) {
  const today = todayIn(timeZone);
  const yesterday = addDays(today, -1);
  const windows = {
    yesterday,
    recentFrom: addDays(today, -RECENT_DAYS),
    baselineTo: addDays(today, -RECENT_DAYS - 1),
    baselineFrom: addDays(today, -RECENT_DAYS - BASELINE_DAYS),
  };

  const rows = await loadDailyRows(
    supabase,
    userId,
    accountId,
    windows.baselineFrom,
    yesterday,
  );
  const found = evaluateAll(rows, windows, (v) => formatMoney(v, currency));
  if (found.length === 0) return 0;

  const { error } = await supabase.from("alerts").upsert(
    found.map((a) => ({
      user_id: userId,
      ad_account_id: accountId,
      campaign_id: a.campaignId,
      campaign_name: a.campaignName,
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      data: a.data,
      alert_date: yesterday,
    })),
    { onConflict: "user_id,ad_account_id,campaign_id,type,alert_date", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Saving alerts failed: ${error.message}`);
  return found.length;
}

// গত কয়েক দিনের যেগুলো এখনো "দেখেছি" করা হয়নি
export async function getActiveAlerts(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  timeZone: string | null,
): Promise<StoredAlert[]> {
  const { data } = await supabase
    .from("alerts")
    .select("id, campaign_name, type, severity, title, message, data, alert_date")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .is("dismissed_at", null)
    .gte("alert_date", addDays(todayIn(timeZone), -RECENT_DAYS))
    .order("alert_date", { ascending: false })
    .order("created_at", { ascending: false });

  const list = (data ?? []) as StoredAlert[];
  // জরুরিগুলো আগে
  return list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
