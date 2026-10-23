import { graphGetAll, type MetaAction } from "./graph";

// নির্দিষ্ট তারিখের হিসাব সরাসরি Meta থেকে। Reach, Frequency, Result যোগ করে বানানো যায় না,
// তাই Ads Manager যেভাবে দেখায় ঠিক সেভাবে Meta-কেই হিসাব করতে দেওয়া হয়।

type ResultValue = { indicator: string; values?: { value: string }[] };

export type RawRangeRow = {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  results?: ResultValue[];
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_play_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p95_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  video_avg_time_watched_actions?: MetaAction[];
  [breakdown: string]: unknown;
};

const BASE_FIELDS = "spend,reach,frequency,impressions,clicks,inline_link_clicks,actions,action_values";
const VIDEO_FIELDS =
  "video_play_actions,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions";

function timeRange(since: string, until: string) {
  return JSON.stringify({ since, until });
}

export async function fetchCampaignRange(
  token: string,
  accountId: string,
  since: string,
  until: string,
) {
  return graphGetAll<RawRangeRow>(
    `/${accountId}/insights`,
    {
      level: "campaign",
      time_range: timeRange(since, until),
      fields: `campaign_id,campaign_name,objective,results,${BASE_FIELDS},${VIDEO_FIELDS}`,
      limit: "200",
    },
    token,
  );
}

// অ্যাকাউন্টের মোট Reach আলাদা লাগে: একই মানুষ একাধিক ক্যাম্পেইনে থাকতে পারে
export async function fetchAccountRange(
  token: string,
  accountId: string,
  since: string,
  until: string,
) {
  const rows = await graphGetAll<RawRangeRow>(
    `/${accountId}/insights`,
    { level: "account", time_range: timeRange(since, until), fields: `${BASE_FIELDS},${VIDEO_FIELDS}` },
    token,
  );
  return rows[0] ?? null;
}

export const BREAKDOWNS = {
  placement: { en: "Placement", bn: "প্লেসমেন্ট", value: "publisher_platform,platform_position" },
  region: { en: "Region", bn: "এলাকা (বিভাগ)", value: "region" },
  country: { en: "Country", bn: "দেশ", value: "country" },
  age: { en: "Age", bn: "বয়স", value: "age" },
  gender: { en: "Gender", bn: "লিঙ্গ", value: "gender" },
  age_gender: { en: "Age & gender", bn: "বয়স ও লিঙ্গ", value: "age,gender" },
  device: { en: "Device", bn: "ডিভাইস", value: "device_platform" },
} as const;

export type BreakdownId = keyof typeof BREAKDOWNS;

export function isBreakdownId(value: unknown): value is BreakdownId {
  return typeof value === "string" && value in BREAKDOWNS;
}

export async function fetchBreakdown(
  token: string,
  accountId: string,
  since: string,
  until: string,
  breakdown: BreakdownId,
) {
  return graphGetAll<RawRangeRow>(
    `/${accountId}/insights`,
    {
      level: "account",
      time_range: timeRange(since, until),
      breakdowns: BREAKDOWNS[breakdown].value,
      fields: BASE_FIELDS,
      limit: "500",
    },
    token,
  );
}

// ---------- একটি ক্যাম্পেইনের বিস্তারিত ----------

// একটি ক্যাম্পেইনের নির্দিষ্ট ব্রেকডাউন (বয়স, এলাকা, ঘণ্টা ইত্যাদি)
export async function fetchObjectBreakdown(
  token: string,
  objectId: string,
  since: string,
  until: string,
  breakdowns: string,
) {
  return graphGetAll<RawRangeRow>(
    `/${objectId}/insights`,
    { time_range: timeRange(since, until), breakdowns, fields: BASE_FIELDS, limit: "500" },
    token,
  );
}

// দিনভিত্তিক (সপ্তাহের কোন দিন ভালো চলে তা বের করতে)
export async function fetchObjectDaily(token: string, objectId: string, since: string, until: string) {
  return graphGetAll<RawRangeRow & { date_start?: string }>(
    `/${objectId}/insights`,
    { time_range: timeRange(since, until), time_increment: "1", fields: BASE_FIELDS, limit: "500" },
    token,
  );
}

type BudgetObject = {
  id: string;
  campaign_id?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

// এই মুদ্রাগুলোতে Meta বাজেট পূর্ণ এককে রাখে; বাকিগুলো সেন্ট/পয়সার মতো ১০০ ভাগে
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export type CampaignBudget = { daily: number; lifetime: number };

// চালু থাকা ক্যাম্পেইনের বাজেট। Campaign Budget (CBO) না থাকলে চালু Ad Set-গুলোর বাজেট যোগ হয়।
export async function fetchBudgets(token: string, accountId: string, currency: string | null) {
  const divisor = currency && ZERO_DECIMAL.has(currency) ? 1 : 100;
  const filtering = JSON.stringify([
    { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
  ]);

  const [campaigns, adsets] = await Promise.all([
    graphGetAll<BudgetObject>(
      `/${accountId}/campaigns`,
      { fields: "id,effective_status,daily_budget,lifetime_budget", filtering, limit: "200" },
      token,
    ),
    graphGetAll<BudgetObject>(
      `/${accountId}/adsets`,
      { fields: "id,campaign_id,effective_status,daily_budget,lifetime_budget", filtering, limit: "200" },
      token,
    ),
  ]);

  const budgets: Record<string, CampaignBudget> = {};
  const num = (v?: string) => (Number(v) || 0) / divisor;

  for (const c of campaigns) {
    budgets[c.id] = { daily: num(c.daily_budget), lifetime: num(c.lifetime_budget) };
  }
  for (const a of adsets) {
    if (!a.campaign_id) continue;
    const b = budgets[a.campaign_id];
    // ক্যাম্পেইনে নিজস্ব বাজেট থাকলে Ad Set-এর বাজেট গোনা হয় না
    if (b && (b.daily > 0 || b.lifetime > 0)) continue;
    budgets[a.campaign_id] = {
      daily: (b?.daily ?? 0) + num(a.daily_budget),
      lifetime: (b?.lifetime ?? 0) + num(a.lifetime_budget),
    };
  }
  return budgets;
}
