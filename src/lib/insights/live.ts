import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaAction } from "@/lib/meta/graph";
import {
  BREAKDOWNS,
  fetchAccountRange,
  fetchBreakdown,
  fetchBudgets,
  fetchCampaignRange,
  type BreakdownId,
  type CampaignBudget,
  type RawRangeRow,
} from "@/lib/meta/rangeInsights";
import { pickAction, pickPurchaseValue, pickPurchases } from "@/lib/metrics";
import { addDays } from "@/lib/dates";

// ---------- ক্যাশ ----------

// আজ বা গতকাল থাকলে ডাটা দিনের মধ্যে বদলায়, তাই কম সময় জমা থাকে
const RECENT_TTL_MS = 15 * 60 * 1000;
const PAST_TTL_MS = 6 * 60 * 60 * 1000;

type Ctx = { supabase: SupabaseClient; userId: string; token: string; accountId: string };

async function cached<T>(
  ctx: Ctx,
  kind: string,
  since: string,
  until: string,
  today: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const maxAge = until >= addDays(today, -1) ? RECENT_TTL_MS : PAST_TTL_MS;
  const { data } = await ctx.supabase
    .from("insights_cache")
    .select("payload, fetched_at")
    .eq("user_id", ctx.userId)
    .eq("ad_account_id", ctx.accountId)
    .eq("kind", kind)
    .eq("date_from", since)
    .eq("date_to", until)
    .maybeSingle();

  if (data && Date.now() - new Date(data.fetched_at).getTime() < maxAge) {
    return data.payload as T;
  }

  const payload = await fetcher();
  await ctx.supabase.from("insights_cache").upsert(
    {
      user_id: ctx.userId,
      ad_account_id: ctx.accountId,
      kind,
      date_from: since,
      date_to: until,
      payload,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "user_id,ad_account_id,kind,date_from,date_to" },
  );
  return payload;
}

// "রিফ্রেশ" চাপলে জমা থাকা হিসাব মুছে যায়, যাতে পরের বার Meta থেকে নতুন করে আসে
export async function clearLiveCache(supabase: SupabaseClient, userId: string, accountId: string) {
  await supabase.from("insights_cache").delete().eq("user_id", userId).eq("ad_account_id", accountId);
}

// ---------- হিসাব ----------

export type VideoStats = {
  plays: number;
  views3s: number;
  thruplays: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  avgWatchSec: number | null;
};

export type WebStats = {
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
};

export type LiveStats = {
  spend: number;
  reach: number;
  frequency: number | null;
  impressions: number;
  clicks: number;
  video: VideoStats;
  web: WebStats;
};

export type LiveCampaign = LiveStats & {
  id: string;
  name: string;
  resultIndicator: string | null;
  results: number;
  budget: CampaignBudget | null;
};

export type LiveReport = {
  account: LiveStats;
  campaigns: LiveCampaign[];
  // সবচেয়ে বেশি খরচ হওয়া ধরনের Result (অ্যাকাউন্টের মোট Result এটি দিয়ে)
  primaryIndicator: string | null;
  primaryResults: number;
  primarySpend: number;
  otherResults: { indicator: string; results: number }[];
  budgetDaily: number;
  budgetLifetime: number;
};

const n = (v: unknown) => Number(v) || 0;
const firstValue = (list?: MetaAction[]) => n(list?.[0]?.value);

function parseStats(r: RawRangeRow): LiveStats {
  const avg = r.video_avg_time_watched_actions?.[0]?.value;
  return {
    spend: n(r.spend),
    reach: n(r.reach),
    frequency: r.frequency ? n(r.frequency) : null,
    impressions: n(r.impressions),
    clicks: n(r.clicks),
    video: {
      plays: firstValue(r.video_play_actions),
      views3s: pickAction(r.actions, ["video_view"]),
      thruplays: firstValue(r.video_thruplay_watched_actions),
      p25: firstValue(r.video_p25_watched_actions),
      p50: firstValue(r.video_p50_watched_actions),
      p75: firstValue(r.video_p75_watched_actions),
      p95: firstValue(r.video_p95_watched_actions),
      p100: firstValue(r.video_p100_watched_actions),
      avgWatchSec: avg !== undefined ? n(avg) : null,
    },
    web: {
      linkClicks: n(r.inline_link_clicks),
      landingPageViews: pickAction(r.actions, ["omni_landing_page_view", "landing_page_view"]),
      addToCart: pickAction(r.actions, [
        "omni_add_to_cart",
        "add_to_cart",
        "offsite_conversion.fb_pixel_add_to_cart",
      ]),
      initiateCheckout: pickAction(r.actions, [
        "omni_initiated_checkout",
        "initiate_checkout",
        "offsite_conversion.fb_pixel_initiate_checkout",
      ]),
      purchases: pickPurchases(r.actions),
      purchaseValue: pickPurchaseValue(r.action_values),
    },
  };
}

const emptyStats = (): LiveStats => parseStats({});

export async function loadLiveReport(
  ctx: Ctx,
  range: { since: string; until: string },
  today: string,
  currency: string | null,
): Promise<LiveReport> {
  const { since, until } = range;
  const [campaignRows, accountRow, budgets] = await Promise.all([
    cached(ctx, "campaigns", since, until, today, () =>
      fetchCampaignRange(ctx.token, ctx.accountId, since, until),
    ),
    cached(ctx, "account", since, until, today, () =>
      fetchAccountRange(ctx.token, ctx.accountId, since, until),
    ),
    // বাজেট তারিখের উপর নির্ভর করে না; এখনকার চালু বাজেট
    cached(ctx, "budgets", today, today, today, () =>
      fetchBudgets(ctx.token, ctx.accountId, currency),
    ),
  ]);

  const campaigns: LiveCampaign[] = campaignRows
    .map((r) => {
      const res = r.results?.[0];
      return {
        ...parseStats(r),
        id: r.campaign_id ?? "",
        name: r.campaign_name ?? r.campaign_id ?? "",
        resultIndicator: res?.indicator ?? null,
        results: n(res?.values?.[0]?.value),
        budget: (r.campaign_id && budgets[r.campaign_id]) || null,
      };
    })
    .filter((c) => c.spend > 0 || c.impressions > 0)
    .sort((a, b) => b.spend - a.spend);

  // ধরন অনুযায়ী মোট Result ও সেই ধরনের ক্যাম্পেইনে খরচ
  const byIndicator = new Map<string, { results: number; spend: number }>();
  for (const c of campaigns) {
    if (!c.resultIndicator) continue;
    const e = byIndicator.get(c.resultIndicator) ?? { results: 0, spend: 0 };
    e.results += c.results;
    e.spend += c.spend;
    byIndicator.set(c.resultIndicator, e);
  }
  const ranked = [...byIndicator.entries()].sort((a, b) => b[1].spend - a[1].spend);
  const primary = ranked[0];

  const budgetValues = Object.values(budgets);
  return {
    account: accountRow ? parseStats(accountRow) : emptyStats(),
    campaigns,
    primaryIndicator: primary?.[0] ?? null,
    primaryResults: primary?.[1].results ?? 0,
    primarySpend: primary?.[1].spend ?? 0,
    otherResults: ranked
      .slice(1)
      .filter(([, v]) => v.results > 0)
      .map(([indicator, v]) => ({ indicator, results: v.results })),
    budgetDaily: budgetValues.reduce((s, b) => s + b.daily, 0),
    budgetLifetime: budgetValues.reduce((s, b) => s + b.lifetime, 0),
  };
}

// results null = এই ব্রেকডাউনে Meta এই ধরনের Result দেয় না (যেমন এলাকা অনুযায়ী ওয়েবসাইট Purchase)
export type BreakdownRow = LiveStats & { key: string; label: string; results: number | null };

const PLACEMENT_LABELS: Record<string, string> = {
  feed: "Feed",
  facebook_reels: "Reels",
  instagram_reels: "Reels",
  story: "Stories",
  facebook_stories: "Stories",
  instagram_stories: "Stories",
  marketplace: "Marketplace",
  video_feeds: "Video feeds",
  instream_video: "In-stream video",
  search: "Search",
  an_classic: "Native, banner & interstitial",
  rewarded_video: "Rewarded video",
  instagram_explore: "Explore",
  instagram_explore_grid_home: "Explore home",
  facebook_profile_feed: "Profile feed",
  facebook_notification: "Notifications",
  messenger_inbox: "Inbox",
};

const GENDER_LABELS: Record<string, string> = { male: "পুরুষ", female: "নারী", unknown: "অজানা" };

function breakdownLabel(r: RawRangeRow, id: BreakdownId) {
  const s = (k: string) => String(r[k] ?? "");
  switch (id) {
    case "placement": {
      const platform = s("publisher_platform").replace("_", " ");
      const pos = PLACEMENT_LABELS[s("platform_position")] ?? s("platform_position").replaceAll("_", " ");
      return `${platform.charAt(0).toUpperCase()}${platform.slice(1)} · ${pos}`;
    }
    case "gender":
      return GENDER_LABELS[s("gender")] ?? s("gender");
    case "age_gender":
      return `${s("age")} · ${GENDER_LABELS[s("gender")] ?? s("gender")}`;
    default:
      return s(BREAKDOWNS[id].value) || "অজানা";
  }
}

// ব্রেকডাউনে Meta "results" দেয় না, তাই অ্যাকাউন্টের মূল Result-এর action থেকে গোনা হয়
export async function loadBreakdown(
  ctx: Ctx,
  range: { since: string; until: string },
  today: string,
  breakdown: BreakdownId,
  primaryIndicator: string | null,
): Promise<BreakdownRow[]> {
  const rows = await cached(ctx, `breakdown:${breakdown}`, range.since, range.until, today, () =>
    fetchBreakdown(ctx.token, ctx.accountId, range.since, range.until, breakdown),
  );
  const actionType = primaryIndicator?.startsWith("actions:")
    ? primaryIndicator.slice("actions:".length)
    : null;
  // কোনো সারিতেই action-টি না থাকলে ধরে নেওয়া হয় Meta এই ব্রেকডাউনে এটি দেয় না
  const available =
    actionType !== null && rows.some((r) => r.actions?.some((a) => a.action_type === actionType));

  return rows
    .map((r) => {
      const stats = parseStats(r);
      return {
        ...stats,
        key: BREAKDOWNS[breakdown].value
          .split(",")
          .map((k) => String(r[k] ?? ""))
          .join("|"),
        label: breakdownLabel(r, breakdown),
        results: available ? pickAction(r.actions, [actionType!]) : null,
      };
    })
    .filter((r) => r.spend > 0 || r.impressions > 0)
    .sort((a, b) => b.spend - a.spend);
}

// Meta-র Result ধরনের সহজ নাম
const INDICATOR_LABELS: Record<string, string> = {
  "actions:offsite_conversion.fb_pixel_purchase": "Purchase (ওয়েবসাইট)",
  "actions:omni_purchase": "Purchase",
  "actions:purchase": "Purchase",
  "actions:onsite_web_purchase": "Purchase",
  "actions:onsite_conversion.messaging_conversation_started_7d": "মেসেজ কনভারসেশন",
  "actions:lead": "Lead",
  "actions:onsite_conversion.lead_grouped": "Lead (ফর্ম)",
  "actions:offsite_conversion.fb_pixel_lead": "Lead (ওয়েবসাইট)",
  "actions:link_click": "লিংক ক্লিক",
  "actions:landing_page_view": "Landing page view",
  "actions:post_engagement": "Post engagement",
  "actions:page_engagement": "Page engagement",
  "actions:like": "Page like",
  "actions:video_view": "৩ সেকেন্ড ভিডিও প্লে",
  "video_thruplay_watched_actions": "ThruPlay",
  reach: "Reach",
  impressions: "Impression",
};

export function indicatorLabel(indicator: string | null) {
  if (!indicator) return "Result";
  return INDICATOR_LABELS[indicator] ?? indicator.replace(/^actions:/, "").replaceAll("_", " ");
}
