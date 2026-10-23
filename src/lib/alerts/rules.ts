import { emptyTotals, addTotals, deriveMetrics, type Totals } from "@/lib/metrics";
import { enTr, type Tr } from "@/lib/i18n";

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

// শিরোনাম ও বার্তা সংরক্ষিত সংখ্যা (data) থেকে তৈরি হয়, তাই প্রত্যেকে নিজের ভাষায় দেখে
export function alertText(
  type: string,
  data: Record<string, number | null>,
  money: Fmt,
  tr: Tr = enTr,
): { title: string; message: string } | null {
  const d = (k: string) => data[k] ?? null;
  switch (type) {
    case "no_results":
      return {
        title: tr("Spending, but no results", "খরচ হচ্ছে, কিন্তু কোনো ফলাফল নেই"),
        message: tr(
          `${money(d("recent_spend"))} spent in the last ${RECENT_DAYS} days without a single purchase or lead. In the ${BASELINE_DAYS} days before, a result came in about every ${money(d("baseline_cost_per_result"))}.`,
          `গত ${RECENT_DAYS} দিনে ${money(d("recent_spend"))} খরচ হয়েছে, কিন্তু একটিও Purchase বা Lead আসেনি। আগের ${BASELINE_DAYS} দিনে গড়ে ${money(d("baseline_cost_per_result"))}-এ একটি ফলাফল আসত।`,
        ),
      };
    case "cpa_spike":
    case "cpl_spike": {
      const recent = d("recent");
      const base = d("baseline");
      if (recent === null || base === null || base === 0) return null;
      const what = type === "cpa_spike" ? "Purchase" : "Lead";
      return {
        title: tr(`Cost per ${what} up ${pct(base, recent)}%`, `Cost per ${what} ${pct(base, recent)}% বেড়েছে`),
        message: tr(
          `Each ${what.toLowerCase()} cost ${money(recent)} over the last ${RECENT_DAYS} days, up from ${money(base)} in the ${BASELINE_DAYS} days before.`,
          `গত ${RECENT_DAYS} দিনে প্রতি ${what}-এ ${money(recent)} খরচ হচ্ছে, আগের ${BASELINE_DAYS} দিনে ছিল ${money(base)}।`,
        ),
      };
    }
    case "ctr_drop": {
      const recent = d("recent");
      const base = d("baseline");
      if (recent === null || base === null || base === 0) return null;
      return {
        title: tr(`CTR down ${Math.abs(pct(base, recent))}%`, `CTR ${Math.abs(pct(base, recent))}% কমেছে`),
        message: tr(
          `CTR was ${recent.toFixed(2)}% over the last ${RECENT_DAYS} days, against ${base.toFixed(2)}% before. The ad may be wearing out; try a fresh creative.`,
          `গত ${RECENT_DAYS} দিনে CTR ${recent.toFixed(2)}%, আগের ${BASELINE_DAYS} দিনে ছিল ${base.toFixed(2)}%। বিজ্ঞাপন পুরনো হয়ে যেতে পারে, নতুন ক্রিয়েটিভ পরীক্ষা করো।`,
        ),
      };
    }
    case "spend_surge":
      return {
        title: tr("Yesterday's spend was far above normal", "গতকাল খরচ স্বাভাবিকের চেয়ে অনেক বেশি"),
        message: tr(
          `${money(d("yesterday"))} was spent yesterday, against a daily average of ${money(d("baseline_daily_avg"))} over the previous ${BASELINE_DAYS} days. Check whether a budget or bid was changed.`,
          `গতকাল ${money(d("yesterday"))} খরচ হয়েছে, আগের ${BASELINE_DAYS} দিনের দৈনিক গড় ছিল ${money(d("baseline_daily_avg"))}। বাজেট বা bid বদলানো হয়েছে কিনা দেখো।`,
        ),
      };
    default:
      return null;
  }
}

// সংরক্ষণের জন্য ইংরেজি লেখা (দেখানোর সময় data থেকে আবার নিজের ভাষায় তৈরি হয়)
function withText(a: Omit<AlertCandidate, "title" | "message">, money: Fmt): AlertCandidate {
  const text = alertText(a.type, a.data, money) ?? { title: a.type, message: "" };
  return { ...a, ...text };
}

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
    alerts.push(
      withText(
        {
          ...base,
          type: "no_results",
          severity: "high",
          data: { recent_spend: round(recent.spend), baseline_cost_per_result: round(costPerResult) },
        },
        money,
      ),
    );
  }

  // ২. Purchase-প্রতি খরচ হঠাৎ বেড়েছে
  if (
    recent.purchases >= MIN_RECENT_CONVERSIONS &&
    baseline.purchases >= MIN_BASELINE_CONVERSIONS &&
    rm.costPerPurchase !== null &&
    bm.costPerPurchase !== null &&
    rm.costPerPurchase >= bm.costPerPurchase * SPIKE_RATIO
  ) {
    alerts.push(
      withText(
        {
          ...base,
          type: "cpa_spike",
          severity: rm.costPerPurchase >= bm.costPerPurchase * SEVERE_SPIKE_RATIO ? "high" : "medium",
          data: { recent: round(rm.costPerPurchase), baseline: round(bm.costPerPurchase) },
        },
        money,
      ),
    );
  }

  // ৩. Lead-প্রতি খরচ হঠাৎ বেড়েছে
  if (
    recent.leads >= MIN_RECENT_CONVERSIONS &&
    baseline.leads >= MIN_BASELINE_CONVERSIONS &&
    rm.costPerLead !== null &&
    bm.costPerLead !== null &&
    rm.costPerLead >= bm.costPerLead * SPIKE_RATIO
  ) {
    alerts.push(
      withText(
        {
          ...base,
          type: "cpl_spike",
          severity: rm.costPerLead >= bm.costPerLead * SEVERE_SPIKE_RATIO ? "high" : "medium",
          data: { recent: round(rm.costPerLead), baseline: round(bm.costPerLead) },
        },
        money,
      ),
    );
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
    alerts.push(
      withText(
        { ...base, type: "ctr_drop", severity: "medium", data: { recent: round(rm.ctr), baseline: round(bm.ctr) } },
        money,
      ),
    );
  }

  // ৫. গতকালের খরচ হঠাৎ অনেক বেশি
  const yesterdaySpend = sum(rows.filter((r) => r.date === windows.yesterday)).spend;
  const avgDaily = baseline.spend / BASELINE_DAYS;
  if (avgDaily > 0 && yesterdaySpend >= avgDaily * SURGE_RATIO) {
    alerts.push(
      withText(
        {
          ...base,
          type: "spend_surge",
          severity: "medium",
          data: { yesterday: round(yesterdaySpend), baseline_daily_avg: round(avgDaily) },
        },
        money,
      ),
    );
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
