import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignAnalysis, Segment } from "@/lib/insights/campaign";
import { daysInRange } from "@/lib/dates";
import { getActiveAiConfig } from "./config";
import { AiError, generateText } from "./providers";
import { makeTr, type Locale } from "@/lib/i18n";

export type Priority = "high" | "medium" | "low";

export type CampaignReport = {
  locale?: Locale;
  headline: string;
  overview: string;
  best_audience: { dimension: string; finding: string }[];
  video_analysis: string | null;
  website_analysis: string | null;
  problems: { title: string; evidence: string }[];
  solutions: { action: string; reason: string; priority: Priority }[];
};

export type StoredCampaignReport = {
  id: string;
  date_from: string;
  date_to: string;
  report_date: string;
  model: string;
  content: CampaignReport;
  created_at: string;
};

const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const pct = (a: number, b: number) => (b > 0 ? round((a / b) * 100, 1) : null);

// ধাপে ধাপে কোথায় সবচেয়ে বেশি মানুষ হারিয়ে যাচ্ছে (কোডে হিসাব)।
// কোনো ধাপ আগেরটির চেয়ে বেশি হলে আগের ধাপের ইভেন্টই কম ট্র্যাক হচ্ছে (যেমন checkout ৩, purchase ১৫৪)।
function funnel(steps: { stage: string; count: number }[]) {
  const undertracked = new Set<string>();
  const out = steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1] : null;
    if (prev && s.count > prev.count) undertracked.add(prev.stage);
    return {
      stage: s.stage,
      count: s.count,
      kept_from_previous_pct: prev?.count ? pct(s.count, prev.count) : null,
    };
  });
  // কম ট্র্যাক হওয়া ধাপ বা তার পরের ধাপকে "ড্রপ" ধরা হয় না, কারণ সেগুলো ভুল সংখ্যা
  const drops = out
    .filter((s, i) => {
      if (s.kept_from_previous_pct === null || s.kept_from_previous_pct > 100) return false;
      return !undertracked.has(s.stage) && !undertracked.has(out[i - 1]?.stage ?? "");
    })
    .sort((a, b) => a.kept_from_previous_pct! - b.kept_from_previous_pct!);
  return {
    stages: out,
    biggest_drop_at: drops[0]?.stage ?? null,
    undertracked_stages: [...undertracked],
  };
}

function segmentJson(s: Segment) {
  return {
    segment: s.label,
    spend: round(s.spend),
    spend_share_pct: round(s.share, 1),
    results: s.results,
    cost_per_result: round(s.cpr),
    link_ctr_pct: round(s.ctr),
  };
}

function buildData(a: CampaignAnalysis, currency: string | null, range: { since: string; until: string }) {
  const c = a.campaign;
  const v = c.video;
  const w = c.web;
  const days = daysInRange(range.since, range.until);
  const roas = c.spend > 0 ? w.purchaseValue / c.spend : null;
  // টাকার অঙ্ক না এলে বা অস্বাভাবিক ROAS হলে মূল্যের হিসাব বিশ্বাসযোগ্য নয়
  const valueReliable = !(w.purchases > 0 && (w.purchaseValue === 0 || (roas !== null && roas > 20)));
  // ছোট সময়ে ৩-এর বেশি, লম্বা সময়ে ৪-এর বেশি হলে একই মানুষ বেশি বার দেখছে
  const frequencyHigh = c.frequency !== null && c.frequency > (days <= 14 ? 3 : 4);

  return {
    campaign: c.name,
    currency: currency ?? "unknown",
    period: { from: range.since, to: range.until, days },
    result_type: a.resultLabel,
    totals: {
      spend: round(c.spend),
      results: c.results,
      cost_per_result: c.results > 0 ? round(c.spend / c.results) : null,
      reach: c.reach,
      frequency: round(c.frequency),
      frequency_is_high: frequencyHigh,
      impressions: c.impressions,
      link_ctr_pct: pct(w.linkClicks, c.impressions),
      daily_budget: c.budget?.daily ?? null,
    },
    purchase_value_reliable: valueReliable,
    dimensions: a.dimensions.map((d) => ({
      dimension: d.label,
      results_available: d.resultsAvailable,
      best: d.best ? segmentJson(d.best) : null,
      worst: d.worst ? segmentJson(d.worst) : null,
      // ঘণ্টা ২৪টি; বাকিগুলোর বড় ১০টি যথেষ্ট
      segments: (d.id === "hour" ? d.segments : d.segments.slice(0, 10)).map(segmentJson),
    })),
    video:
      v.plays > 0 || v.views3s > 0
        ? {
            hook_rate_pct: pct(v.views3s, c.impressions),
            hold_rate_pct: pct(v.thruplays, v.views3s),
            avg_watch_sec: v.avgWatchSec,
            thruplays: v.thruplays,
            funnel: funnel([
              { stage: "3-second view", count: v.views3s },
              { stage: "25% watched", count: v.p25 },
              { stage: "50% watched", count: v.p50 },
              { stage: "75% watched", count: v.p75 },
              { stage: "95% watched", count: v.p95 },
              { stage: "100% watched", count: v.p100 },
            ]),
          }
        : null,
    website:
      w.linkClicks > 0
        ? {
            // অবিশ্বস্ত হলে AI-কে মানই পাঠানো হয় না, যাতে ভুল ROAS না লেখে
            roas: valueReliable ? round(roas) : null,
            purchase_value: valueReliable ? round(w.purchaseValue) : null,
            funnel: funnel([
              { stage: "link click", count: w.linkClicks },
              { stage: "landing page view", count: w.landingPageViews },
              { stage: "add to cart", count: w.addToCart },
              { stage: "initiate checkout", count: w.initiateCheckout },
              { stage: "purchase", count: w.purchases },
            ]),
          }
        : null,
  };
}

const LANGUAGE_RULES: Record<Locale, string> = {
  bn: `- Refer to the period as "গত {period.days} দিনে" or by its dates. Never say "এই মাসে" or "এই সপ্তাহে".
- Example solutions: "২৫-৩৪ বয়সে বাজেট বাড়াও", "রাত ১১টা থেকে সকাল ৭টা বিজ্ঞাপন কমাও", "প্রথম ৩ সেকেন্ড আরও আকর্ষণীয় করো", "Initiate checkout ইভেন্ট ঠিক করো".`,
  en: `- Refer to the period as "over the last {period.days} days" or by its dates. Never say "this month" or "this week".
- Write every text field in plain, friendly English, addressing the reader as "you". Keep metric names (Result, Cost per Result, CTR, ROAS, ThruPlay, Hook rate, Hold rate) and segment names as given.
- Example solutions: "Raise the budget for ages 25-34", "Cut delivery between 11 PM and 7 AM", "Make the first 3 seconds more gripping", "Fix the Initiate checkout event".`,
};

const systemPrompt = (locale: Locale) => `You are a senior Meta (Facebook/Instagram) ads analyst writing a campaign deep-dive for a small business owner in Bangladesh.

You receive one campaign's data as JSON. All numbers are calculated by code; "best" and "worst" per dimension are already chosen by code.
Rules:
- Use ONLY numbers present in the data. Never invent or recalculate figures.
- "headline": one specific sentence with the single most important takeaway and a number, not a title.
${LANGUAGE_RULES[locale]}
- If purchase_value_reliable is false, never mention ROAS or purchase value; add fixing the purchase value/currency in the Pixel as a problem and solution.
- Mention frequency as a problem ONLY if totals.frequency_is_high is true.
- website.funnel.undertracked_stages lists events that are tracked LESS than the next stage (e.g. checkout lower than purchase). Say exactly those events are not firing correctly; do not blame the later stage. A drop INTO an undertracked stage is caused by the tracking problem, not by visitors leaving: never treat it as a real drop-off or suggest page changes for it.
- Never show JSON field names (like purchase_value_reliable, frequency_is_high) in the text; explain in plain words.
- best_audience: one item per dimension that has a clear finding (age, gender, location, placement, device, time of day, day of week). Say where results are best and cheapest, with numbers. If results_available is false for a dimension, say Meta does not report results there and use spend and CTR only. For day of week, if each weekday has only 1 day of data, say the pattern is not yet reliable.
- video_analysis: where viewers drop off most (use video.funnel.biggest_drop_at and the percentages), what hook rate and hold rate mean here. null if video is null.
- website_analysis: at which stage visitors drop off most (website.funnel.biggest_drop_at), with the percentage kept. Then mention undertracked_stages if any. null if website is null.
- problems: concrete issues with evidence numbers (expensive segments, wasted spend, drop-offs, tracking gaps, high frequency).
- solutions: concrete actions for THIS campaign with a reason citing numbers. "high" only for wasted money now or broken tracking.
- Be concise: overview 2-3 sentences; at most 7 best_audience, 5 problems, 6 solutions.

Respond with ONLY one JSON object, no markdown:
{"headline": string, "overview": string, "best_audience": [{"dimension": string, "finding": string}], "video_analysis": string | null, "website_analysis": string | null, "problems": [{"title": string, "evidence": string}], "solutions": [{"action": string, "reason": string, "priority": "high" | "medium" | "low"}]}`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = <T>(v: unknown, map: (x: Record<string, unknown>) => T | null, max: number) =>
  Array.isArray(v)
    ? v
        .map((x) => map((x ?? {}) as Record<string, unknown>))
        .filter((x): x is T => x !== null)
        .slice(0, max)
    : [];

export function parseCampaignReport(text: string, locale: Locale = "en"): CampaignReport {
  const tr = makeTr(locale);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError(tr("Couldn't understand the AI's answer. Please try again.", "AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।"));
  }

  const report: CampaignReport = {
    locale,
    headline: str(raw.headline),
    overview: str(raw.overview),
    best_audience: list(
      raw.best_audience,
      (x) => (str(x.finding) ? { dimension: str(x.dimension), finding: str(x.finding) } : null),
      7,
    ),
    video_analysis: str(raw.video_analysis) || null,
    website_analysis: str(raw.website_analysis) || null,
    problems: list(
      raw.problems,
      (x) => (str(x.title) ? { title: str(x.title), evidence: str(x.evidence) } : null),
      5,
    ),
    solutions: list(
      raw.solutions,
      (x) =>
        str(x.action)
          ? {
              action: str(x.action),
              reason: str(x.reason),
              priority: (["high", "medium", "low"].includes(x.priority as string)
                ? x.priority
                : "medium") as Priority,
            }
          : null,
      6,
    ),
  };
  if (!report.headline && !report.overview) {
    throw new AiError(tr("The AI returned an empty answer. Please try again.", "AI খালি উত্তর দিয়েছে। আবার চেষ্টা করো।"));
  }
  return report;
}

export async function getTodaysReport(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  today: string,
) {
  const { data } = await supabase
    .from("campaign_reports")
    .select("id, date_from, date_to, report_date, model, content, created_at")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("report_date", today)
    .maybeSingle();
  return (data as StoredCampaignReport | null) ?? null;
}

export async function getLatestReport(supabase: SupabaseClient, userId: string, campaignId: string) {
  const { data } = await supabase
    .from("campaign_reports")
    .select("id, date_from, date_to, report_date, model, content, created_at")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StoredCampaignReport | null) ?? null;
}

export async function generateCampaignReport(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  analysis: CampaignAnalysis,
  currency: string | null,
  range: { since: string; until: string },
  today: string,
  locale: Locale = "en",
): Promise<StoredCampaignReport> {
  const tr = makeTr(locale);
  const alreadyToday = tr(
    "You've already taken today's report for this campaign. You can take another tomorrow.",
    "আজ এই ক্যাম্পেইনের রিপোর্ট নেওয়া হয়ে গেছে। কাল আবার নিতে পারবে।",
  );
  if (await getTodaysReport(supabase, userId, analysis.campaign.id, today)) {
    throw new AiError(alreadyToday);
  }
  if (analysis.campaign.spend <= 0) {
    throw new AiError(
      tr("This campaign spent nothing in this period, so there's nothing to analyze.", "এই সময়ে ক্যাম্পেইনে খরচ হয়নি, তাই বিশ্লেষণ করার মতো ডাটা নেই।"),
    );
  }

  const cfg = await getActiveAiConfig(supabase);
  const text = await generateText(cfg, {
    system: systemPrompt(locale),
    prompt: `Analyze this campaign and respond with the JSON object only.\n\n${JSON.stringify(buildData(analysis, currency, range))}`,
    maxTokens: 10000,
  });
  const content = parseCampaignReport(text, locale);

  const { data, error } = await supabase
    .from("campaign_reports")
    .insert({
      user_id: userId,
      ad_account_id: accountId,
      campaign_id: analysis.campaign.id,
      campaign_name: analysis.campaign.name,
      date_from: range.since,
      date_to: range.until,
      report_date: today,
      provider: cfg.provider,
      model: cfg.model,
      content,
    })
    .select("id, date_from, date_to, report_date, model, content, created_at")
    .single();

  // একই সময়ে দুইবার চাপলে ডাটাবেসের unique নিয়ম দ্বিতীয়টি আটকে দেয়
  if (error?.code === "23505") throw new AiError(alreadyToday);
  if (error || !data) throw new AiError(tr("Couldn't save the report.", "রিপোর্ট সংরক্ষণ করা যায়নি।"));
  return data as StoredCampaignReport;
}
