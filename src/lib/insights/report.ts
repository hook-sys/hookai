import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addTotals,
  deriveMetrics,
  emptyTotals,
  type DerivedMetrics,
  type Totals,
} from "@/lib/metrics";

import { daysInRange, previousRange } from "@/lib/dates";
import { enTr, type Tr } from "@/lib/i18n";

// ড্যাশবোর্ড ও AI দুটোই এখান থেকে একই হিসাব নেয়, যাতে দুই জায়গায় সংখ্যা আলাদা না হয়

type InsightRow = {
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  leads: number;
};

export type CampaignStat = {
  id: string;
  name: string;
  totals: Totals;
  m: DerivedMetrics;
};

export type PeriodStats = {
  since: string;
  until: string;
  total: Totals;
  m: DerivedMetrics;
  campaigns: CampaignStat[];
};

// Supabase এক কোয়েরিতে সর্বোচ্চ ১০০০ সারি দেয়, তাই পাতায় পাতায় আনা হয়
const PAGE = 1000;

async function loadRows(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  since: string,
  until: string,
) {
  const rows: InsightRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ad_insights_daily")
      .select(
        "date, campaign_id, campaign_name, spend, impressions, clicks, purchases, purchase_value, leads",
      )
      .eq("user_id", userId)
      .eq("ad_account_id", accountId)
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true })
      .order("campaign_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as InsightRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function toTotals(r: InsightRow): Totals {
  return {
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    purchases: Number(r.purchases),
    purchaseValue: Number(r.purchase_value),
    leads: Number(r.leads),
  };
}

// দিনভিত্তিক সারি (অ্যালার্টের নিয়মের জন্য)
export async function loadDailyRows(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  since: string,
  until: string,
) {
  const rows = await loadRows(supabase, userId, accountId, since, until);
  return rows.map((r) => ({
    date: r.date,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    totals: toTotals(r),
  }));
}

async function loadPeriod(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  since: string,
  until: string,
): Promise<PeriodStats> {
  const rows = await loadRows(supabase, userId, accountId, since, until);

  const byCampaign = new Map<string, { name: string; totals: Totals }>();
  let total = emptyTotals();
  for (const r of rows) {
    const t = toTotals(r);
    total = addTotals(total, t);
    const entry = byCampaign.get(r.campaign_id) ?? {
      name: r.campaign_name ?? r.campaign_id,
      totals: emptyTotals(),
    };
    entry.totals = addTotals(entry.totals, t);
    byCampaign.set(r.campaign_id, entry);
  }

  const campaigns = [...byCampaign.entries()]
    .map(([id, c]) => ({ id, name: c.name, totals: c.totals, m: deriveMetrics(c.totals) }))
    .filter((c) => c.totals.spend > 0 || c.totals.impressions > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend);

  return { since, until, total, m: deriveMetrics(total), campaigns };
}

export type PeriodReport = {
  days: number;
  current: PeriodStats;
  // ঠিক আগের সমান দৈর্ঘ্যের সময়ের হিসাব (তুলনার জন্য); "সর্বোচ্চ" সময়ে তুলনা হয় না
  previous: PeriodStats | null;
};

// নির্দিষ্ট তারিখের হিসাব (দুই দিনসহ)। আগের সময়ের ডাটা ডাটাবেসে না থাকলে তুলনা বাদ।
export async function buildPeriodReport(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: { since: string; until: string },
  options: { compare: boolean; dataFrom: string | null },
): Promise<PeriodReport> {
  const prev = previousRange(range.since, range.until);
  const canCompare = options.compare && options.dataFrom !== null && prev.since >= options.dataFrom;

  const [current, previous] = await Promise.all([
    loadPeriod(supabase, userId, accountId, range.since, range.until),
    canCompare
      ? loadPeriod(supabase, userId, accountId, prev.since, prev.until)
      : Promise.resolve(null),
  ]);
  return { days: daysInRange(range.since, range.until), current, previous };
}

// ডাটাবেসে এই Ad Account-এর সবচেয়ে পুরনো দিন ("সর্বোচ্চ" সময়ের শুরু)
export async function earliestDataDate(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
) {
  const { data } = await supabase
    .from("ad_insights_daily")
    .select("date")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.date as string | undefined) ?? null;
}

export type DataWarning = { title: string; detail: string; campaigns: string[] };

// এর বেশি ROAS প্রায় সবসময় ট্র্যাকিং ভুল (যেমন টাকার অঙ্ক ভুল মুদ্রায় পাঠানো)
const SUSPICIOUS_ROAS = 20;

// ডাটার মান যাচাই কোডেই হয়, AI-এর উপর নির্ভর না করে
export function findDataWarnings(period: PeriodStats, tr: Tr = enTr): DataWarning[] {
  const warnings: DataWarning[] = [];

  const noValue = period.campaigns.filter(
    (c) => c.totals.purchases > 0 && c.totals.purchaseValue === 0,
  );
  if (noValue.length > 0) {
    warnings.push({
      title: tr("Purchases recorded, but their value is 0", "Purchase আছে, কিন্তু মূল্য ০"),
      detail: tr(
        "These campaigns count purchases but receive no purchase value, so ROAS shows 0. Check that your Pixel or Conversions API sends a value with the Purchase event.",
        "এই ক্যাম্পেইনগুলোতে Purchase গোনা হচ্ছে কিন্তু টাকার অঙ্ক আসছে না, তাই ROAS ০ দেখায়। Pixel বা Conversions API-তে Purchase ইভেন্টের value পাঠানো হচ্ছে কিনা দেখো।",
      ),
      campaigns: noValue.map((c) => c.name),
    });
  }

  const tooHigh = period.campaigns.filter(
    (c) => c.m.roas !== null && c.m.roas > SUSPICIOUS_ROAS,
  );
  if (tooHigh.length > 0) {
    warnings.push({
      title: tr(
        `ROAS is unrealistically high (above ${SUSPICIOUS_ROAS}x)`,
        `ROAS অস্বাভাবিক বেশি (${SUSPICIOUS_ROAS}x-এর উপরে)`,
      ),
      detail: tr(
        "The purchase value is probably being sent in the wrong currency (for example taka amounts labelled as USD). Check the Purchase event's currency and value in Events Manager.",
        "সম্ভবত Purchase-এর টাকার অঙ্ক ভুল মুদ্রায় যাচ্ছে (যেমন টাকার অঙ্ক USD হিসেবে)। Events Manager-এ Purchase ইভেন্টের currency ও value মিলিয়ে দেখো।",
      ),
      campaigns: tooHigh.map((c) => c.name),
    });
  }

  return warnings;
}
