import { emptyTotals, addTotals, deriveMetrics, type Totals } from "@/lib/metrics";

// অ্যালার্টের নিয়ম পুরোটাই কোডে, যাতে প্রতিবার একই ডাটায় একই ফল আসে।
// প্রতিটি ক্যাম্পেইনের "সাম্প্রতিক" সময়কে তার নিজের আগের সময়ের ("ভিত্তি") সাথে তুলনা করা হয়।

export const RECENT_DAYS = 3; // গত ৩টি পূর্ণ দিন (আজ বাদে)
export const BASELINE_DAYS = 7; // তার আগের ৭ দিন

export type AlertType =
  | "no_results"
  | "cpa_spike"
  | "cpl_spike"
  | "ctr_drop"
  | "spend_surge";

export type Severity = "high" | "medium";

export type AlertCandidate = {
  type: AlertType;
  severity: Severity;
  campaignId: string;
  campaignName: string;
  title: string;
  message: string;
  data: Record<string, number | null>;
};

export type DailyRow = {
  date: string; // YYYY-MM-DD
  campaign_id: string;
  campaign_name: string | null;
  totals: Totals;
};

type Fmt = (v: number | null) => string;

const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const pct = (from: number, to: number) => Math.round(((to - from) / from) * 100);

// নিয়মের সীমা: খুব কম ডাটায় ভুল অ্যালার্ট এড়াতে ন্যূনতম পরিমাণ লাগে
const SPIKE_RATIO = 1.5; // খরচ-প্রতি-ফলাফল ৫০% বা বেশি বাড়লে
const SEVERE_SPIKE_RATIO = 2;
const MIN_RECENT_CONVERSIONS = 2;
const MIN_BASELINE_CONVERSIONS = 3;
const NO_RESULT_SPEND_RATIO = 1.5; // আগের গড় খরচ-প্রতি-ফলাফলের দেড়গুণ খরচ হলেও ফল নেই
const CTR_DROP_RATIO = 0.7; // CTR ৩০% বা বেশি কমলে
const MIN_RECENT_IMPRESSIONS = 1000;
const MIN_BASELINE_IMPRESSIONS = 2000;
const SURGE_RATIO = 2; // গতকালের খরচ আগের দৈনিক গড়ের দ্বিগুণ

function sum(rows: DailyRow[]) {
  return rows.reduce((acc, r) => addTotals(acc, r.totals), emptyTotals());
}

export function evaluateCampaign(
  campaignId: string,
  campaignName: string,
  rows: DailyRow[],
  windows: { recentFrom: string; baselineFrom: string; baselineTo: string; yesterday: string },
  money: Fmt,
): AlertCandidate[] {
  const recentRows = rows.filter((r) => r.date >= windows.recentFrom);
  const baselineRows = rows.filter(
    (r) => r.date >= windows.baselineFrom && r.date <= windows.baselineTo,
  );
  const recent = sum(recentRows);
  const baseline = sum(baselineRows);
  const rm = deriveMetrics(recent);
  const bm = deriveMetrics(baseline);
  const base = { campaignId, campaignName };
  const alerts: AlertCandidate[] = [];

  // ১. খরচ হচ্ছে কিন্তু কোনো ফলাফল নেই
  const baselineResults = baseline.purchases + baseline.leads;
  const recentResults = recent.purchases + recent.leads;
  const costPerResult = baselineResults > 0 ? baseline.spend / baselineResults : null;
  if (
    recentResults === 0 &&
    baselineResults >= MIN_BASELINE_CONVERSIONS &&
    costPerResult !== null &&
    recent.spend >= costPerResult * NO_RESULT_SPEND_RATIO
  ) {
    alerts.push({
      ...base,
      type: "no_results",
      severity: "high",
      title: "খরচ হচ্ছে, কিন্তু কোনো ফলাফল নেই",
      message: `গত ${RECENT_DAYS} দিনে ${money(recent.spend)} খরচ হয়েছে, কিন্তু একটিও Purchase বা Lead আসেনি। আগের ${BASELINE_DAYS} দিনে গড়ে ${money(costPerResult)}-এ একটি ফলাফল আসত।`,
      data: { recent_spend: round(recent.spend), baseline_cost_per_result: round(costPerResult) },
    });
  }

  // ২. Purchase-প্রতি খরচ হঠাৎ বেড়েছে
  if (
    recent.purchases >= MIN_RECENT_CONVERSIONS &&
    baseline.purchases >= MIN_BASELINE_CONVERSIONS &&
    rm.costPerPurchase !== null &&
    bm.costPerPurchase !== null &&
    rm.costPerPurchase >= bm.costPerPurchase * SPIKE_RATIO
  ) {
    alerts.push({
      ...base,
      type: "cpa_spike",
      severity: rm.costPerPurchase >= bm.costPerPurchase * SEVERE_SPIKE_RATIO ? "high" : "medium",
      title: `Cost per Purchase ${pct(bm.costPerPurchase, rm.costPerPurchase)}% বেড়েছে`,
      message: `গত ${RECENT_DAYS} দিনে প্রতি Purchase-এ ${money(rm.costPerPurchase)} খরচ হচ্ছে, আগের ${BASELINE_DAYS} দিনে ছিল ${money(bm.costPerPurchase)}।`,
      data: { recent: round(rm.costPerPurchase), baseline: round(bm.costPerPurchase) },
    });
  }

  // ৩. Lead-প্রতি খরচ হঠাৎ বেড়েছে
  if (
    recent.leads >= MIN_RECENT_CONVERSIONS &&
    baseline.leads >= MIN_BASELINE_CONVERSIONS &&
    rm.costPerLead !== null &&
    bm.costPerLead !== null &&
    rm.costPerLead >= bm.costPerLead * SPIKE_RATIO
  ) {
    alerts.push({
      ...base,
      type: "cpl_spike",
      severity: rm.costPerLead >= bm.costPerLead * SEVERE_SPIKE_RATIO ? "high" : "medium",
      title: `Cost per Lead ${pct(bm.costPerLead, rm.costPerLead)}% বেড়েছে`,
      message: `গত ${RECENT_DAYS} দিনে প্রতি Lead-এ ${money(rm.costPerLead)} খরচ হচ্ছে, আগের ${BASELINE_DAYS} দিনে ছিল ${money(bm.costPerLead)}।`,
      data: { recent: round(rm.costPerLead), baseline: round(bm.costPerLead) },
    });
  }

  // ৪. CTR কমে গেছে: সাধারণত একই বিজ্ঞাপন বারবার দেখে মানুষ বিরক্ত (creative fatigue)
  if (
    recent.impressions >= MIN_RECENT_IMPRESSIONS &&
    baseline.impressions >= MIN_BASELINE_IMPRESSIONS &&
    rm.ctr !== null &&
    bm.ctr !== null &&
    bm.ctr > 0 &&
    rm.ctr <= bm.ctr * CTR_DROP_RATIO
  ) {
    alerts.push({
      ...base,
      type: "ctr_drop",
      severity: "medium",
      title: `CTR ${Math.abs(pct(bm.ctr, rm.ctr))}% কমেছে`,
      message: `গত ${RECENT_DAYS} দিনে CTR ${rm.ctr.toFixed(2)}%, আগের ${BASELINE_DAYS} দিনে ছিল ${bm.ctr.toFixed(2)}%। বিজ্ঞাপন পুরনো হয়ে যেতে পারে, নতুন ক্রিয়েটিভ পরীক্ষা করো।`,
      data: { recent: round(rm.ctr), baseline: round(bm.ctr) },
    });
  }

  // ৫. গতকালের খরচ হঠাৎ অনেক বেশি
  const yesterdaySpend = sum(rows.filter((r) => r.date === windows.yesterday)).spend;
  const avgDaily = baseline.spend / BASELINE_DAYS;
  if (avgDaily > 0 && yesterdaySpend >= avgDaily * SURGE_RATIO) {
    alerts.push({
      ...base,
      type: "spend_surge",
      severity: "medium",
      title: "গতকাল খরচ স্বাভাবিকের চেয়ে অনেক বেশি",
      message: `গতকাল ${money(yesterdaySpend)} খরচ হয়েছে, আগের ${BASELINE_DAYS} দিনের দৈনিক গড় ছিল ${money(avgDaily)}। বাজেট বা bid বদলানো হয়েছে কিনা দেখো।`,
      data: { yesterday: round(yesterdaySpend), baseline_daily_avg: round(avgDaily) },
    });
  }

  return alerts;
}

export function evaluateAll(
  rows: DailyRow[],
  windows: { recentFrom: string; baselineFrom: string; baselineTo: string; yesterday: string },
  money: Fmt,
) {
  const byCampaign = new Map<string, DailyRow[]>();
  for (const r of rows) {
    const list = byCampaign.get(r.campaign_id) ?? [];
    list.push(r);
    byCampaign.set(r.campaign_id, list);
  }

  return [...byCampaign.entries()].flatMap(([id, list]) => {
    const name = list.find((r) => r.campaign_name)?.campaign_name ?? id;
    return evaluateCampaign(id, name, list, windows, money);
  });
}
