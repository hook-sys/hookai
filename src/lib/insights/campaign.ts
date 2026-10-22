import { fetchObjectBreakdown, fetchObjectDaily, type BreakdownId, type RawRangeRow } from "@/lib/meta/rangeInsights";
import { pickAction } from "@/lib/metrics";
import {
  breakdownLabel,
  cached,
  indicatorLabel,
  parseStats,
  type Ctx,
  type LiveCampaign,
} from "./live";

// একটি ক্যাম্পেইনের গভীর বিশ্লেষণ: কোন বয়স, লিঙ্গ, এলাকা, প্লেসমেন্ট, সময় ও দিনে ভালো চলে।
// সেরা ও দুর্বল অংশ কোডে বাছাই হয়; AI শুধু ব্যাখ্যা ও সমাধান লেখে।

const DIMENSIONS = [
  { id: "age", label: "বয়স", breakdowns: "age", labelAs: "age" },
  { id: "gender", label: "লিঙ্গ", breakdowns: "gender", labelAs: "gender" },
  { id: "region", label: "এলাকা", breakdowns: "region", labelAs: "region" },
  { id: "placement", label: "প্লেসমেন্ট", breakdowns: "publisher_platform,platform_position", labelAs: "placement" },
  { id: "device", label: "ডিভাইস", breakdowns: "device_platform", labelAs: "device" },
  { id: "hour", label: "দিনের সময়", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone", labelAs: null },
] as const satisfies readonly { id: string; label: string; breakdowns: string; labelAs: BreakdownId | null }[];

const WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

export type Segment = {
  key: string;
  label: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  results: number | null; // null = Meta এই ভাগে Result দেয় না
  cpr: number | null;
  ctr: number | null; // লিংক CTR %
  share: number | null; // মোট খরচের কত %
};

export type DimensionAnalysis = {
  id: string;
  label: string;
  segments: Segment[];
  resultsAvailable: boolean;
  best: Segment | null;
  worst: Segment | null;
};

// খুব ছোট অংশ ভাগ্যক্রমে "সেরা" না হতে পারে, তাই ন্যূনতম খরচের ভাগ লাগে
const MIN_SHARE = 5;
const MIN_BEST_RESULTS = 2;
const WASTE_SHARE = 10; // এর বেশি খরচ হয়েও ফলাফল ০ হলে সবচেয়ে দুর্বল

function toSegment(key: string, label: string, r: RawRangeRow, actionType: string | null, available: boolean): Omit<Segment, "share"> {
  const s = parseStats(r);
  const results = available && actionType ? pickAction(r.actions, [actionType]) : null;
  return {
    key,
    label,
    spend: s.spend,
    impressions: s.impressions,
    linkClicks: s.web.linkClicks,
    results,
    cpr: results !== null && results > 0 ? s.spend / results : null,
    ctr: s.impressions > 0 ? (s.web.linkClicks / s.impressions) * 100 : null,
  };
}

function analyse(id: string, label: string, raw: Omit<Segment, "share">[], available: boolean): DimensionAnalysis {
  const total = raw.reduce((sum, s) => sum + s.spend, 0);
  const segments = raw
    .map((s) => ({ ...s, share: total > 0 ? (s.spend / total) * 100 : null }))
    .filter((s) => s.spend > 0 || s.impressions > 0);

  const big = segments.filter((s) => (s.share ?? 0) >= MIN_SHARE);
  let best: Segment | null = null;
  let worst: Segment | null = null;

  if (available) {
    const withResults = big.filter((s) => (s.results ?? 0) >= MIN_BEST_RESULTS && s.cpr !== null);
    best = withResults.sort((a, b) => a.cpr! - b.cpr!)[0] ?? null;

    const wasted = big
      .filter((s) => s.results === 0 && (s.share ?? 0) >= WASTE_SHARE)
      .sort((a, b) => b.spend - a.spend)[0];
    const costly = big
      .filter((s) => s.cpr !== null && s !== best)
      .sort((a, b) => b.cpr! - a.cpr!)[0];
    worst = wasted ?? costly ?? null;
  }

  return { id, label, segments, resultsAvailable: available, best, worst };
}

export type CampaignAnalysis = {
  campaign: LiveCampaign;
  resultLabel: string;
  dimensions: DimensionAnalysis[];
};

export async function loadCampaignAnalysis(
  ctx: Ctx,
  campaign: LiveCampaign,
  range: { since: string; until: string },
  today: string,
): Promise<CampaignAnalysis> {
  const actionType = campaign.resultIndicator?.startsWith("actions:")
    ? campaign.resultIndicator.slice("actions:".length)
    : null;
  const hasAction = (rows: RawRangeRow[]) =>
    actionType !== null && rows.some((r) => r.actions?.some((a) => a.action_type === actionType));

  const [dimRows, dailyRows] = await Promise.all([
    Promise.all(
      DIMENSIONS.map((d) =>
        cached(ctx, `campaign:${campaign.id}:${d.id}`, range.since, range.until, today, () =>
          fetchObjectBreakdown(ctx.token, campaign.id, range.since, range.until, d.breakdowns),
        ),
      ),
    ),
    cached(ctx, `campaign:${campaign.id}:daily`, range.since, range.until, today, () =>
      fetchObjectDaily(ctx.token, campaign.id, range.since, range.until),
    ),
  ]);

  const dimensions = DIMENSIONS.map((d, i) => {
    const rows = dimRows[i];
    const available = hasAction(rows);
    const raw = rows.map((r) => {
      const key = d.breakdowns
        .split(",")
        .map((k) => String(r[k] ?? ""))
        .join("|");
      const label =
        d.labelAs !== null
          ? breakdownLabel(r, d.labelAs)
          : `${key.slice(0, 2)}:00 – ${String((Number(key.slice(0, 2)) + 1) % 24).padStart(2, "0")}:00`;
      return toSegment(key, label, r, actionType, available);
    });
    // ঘণ্টা সময়ের ক্রমে, বাকিগুলো খরচ অনুযায়ী
    if (d.id !== "hour") raw.sort((a, b) => b.spend - a.spend);
    return analyse(d.id, d.label, raw, available);
  });

  // সপ্তাহের দিন: দিনভিত্তিক ডাটা দিন অনুযায়ী যোগ করে
  const weekdayAvailable = hasAction(dailyRows);
  const byDay = new Map<number, RawRangeRow[]>();
  for (const r of dailyRows) {
    if (!r.date_start) continue;
    const day = new Date(`${r.date_start}T00:00:00Z`).getUTCDay();
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  const weekdayRaw = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, rows]) => {
      const sum = (pick: (s: ReturnType<typeof parseStats>) => number) =>
        rows.reduce((t, r) => t + pick(parseStats(r)), 0);
      const results =
        weekdayAvailable && actionType
          ? rows.reduce((t, r) => t + pickAction(r.actions, [actionType]), 0)
          : null;
      const spend = sum((s) => s.spend);
      const impressions = sum((s) => s.impressions);
      const linkClicks = sum((s) => s.web.linkClicks);
      return {
        key: String(day),
        label: `${WEEKDAYS[day]} (${rows.length} দিন)`,
        spend,
        impressions,
        linkClicks,
        results,
        cpr: results !== null && results > 0 ? spend / results : null,
        ctr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
      };
    });
  dimensions.push(analyse("weekday", "সপ্তাহের দিন", weekdayRaw, weekdayAvailable));

  return { campaign, resultLabel: indicatorLabel(campaign.resultIndicator), dimensions };
}
