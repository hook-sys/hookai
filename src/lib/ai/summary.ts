import type { SupabaseClient } from "@supabase/supabase-js";
import type { DerivedMetrics, Totals } from "@/lib/metrics";
import type { DataWarning, PeriodReport, PeriodStats } from "@/lib/insights/report";
import { getActiveAiConfig } from "./config";
import { AiError, generateText } from "./providers";

export type Priority = "high" | "medium" | "low";

export type AiSummary = {
  headline: string;
  overview: string;
  highlights: string[];
  concerns: string[];
  recommendations: { action: string; campaign: string | null; reason: string; priority: Priority }[];
};

export type StoredSummary = {
  id: string;
  provider: string;
  model: string;
  content: AiSummary;
  created_at: string;
};

// AI-কে শুধু ব্যাখ্যা করতে দেওয়া হয়; সব সংখ্যা কোডে হিসাব করা এবং এখান থেকেই যায়
const SYSTEM_PROMPT = `You are a senior Meta (Facebook/Instagram) ads performance analyst helping a small business owner in Bangladesh.

You receive ad performance data as JSON. All numbers are already calculated correctly by code.
Rules:
- Use ONLY numbers present in the data. Never invent, estimate or recalculate figures.
- Write every text field in simple, friendly Bengali (Bangla). Keep metric names (Spend, CPA, ROAS, CTR, CPC, CPM, Purchase, Lead) and campaign names exactly as given.
- Address the reader as "তুমি".
- If "previous" is present, compare current vs previous period and mention the important changes with numbers.
- If "data_warnings" is not empty, treat those campaigns' ROAS / purchase value as unreliable: do not praise or blame them on ROAS, and mention fixing tracking in concerns.
- Recommendations must be concrete actions on named campaigns (pause, scale budget, refresh creative, fix tracking, test audience), each with a short data-based reason.
- Be concise: overview 2-3 sentences; at most 4 highlights, 4 concerns and 5 recommendations.

Respond with ONLY one JSON object, no markdown, no code fences, matching exactly:
{"headline": string, "overview": string, "highlights": string[], "concerns": string[], "recommendations": [{"action": string, "campaign": string | null, "reason": string, "priority": "high" | "medium" | "low"}]}`;

const MAX_CAMPAIGNS = 25;

const round = (v: number | null, digits = 2) =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

function metricsJson(t: Totals, m: DerivedMetrics) {
  return {
    spend: round(t.spend),
    impressions: t.impressions,
    clicks: t.clicks,
    purchases: round(t.purchases),
    purchase_value: round(t.purchaseValue),
    leads: round(t.leads),
    ctr_percent: round(m.ctr),
    cpc: round(m.cpc),
    cpm: round(m.cpm),
    cost_per_purchase: round(m.costPerPurchase),
    cost_per_lead: round(m.costPerLead),
    roas: round(m.roas),
  };
}

function periodJson(p: PeriodStats) {
  return {
    date_from: p.since,
    date_to: p.until,
    totals: metricsJson(p.total, p.m),
    campaigns: p.campaigns.slice(0, MAX_CAMPAIGNS).map((c) => ({
      name: c.name,
      ...metricsJson(c.totals, c.m),
    })),
  };
}

export function buildPrompt(
  report: PeriodReport,
  account: { name: string; currency: string | null },
  warnings: DataWarning[],
) {
  const data = {
    ad_account: account.name,
    currency: account.currency ?? "unknown",
    period_days: report.range,
    note: "Dates exclude today because today's data is incomplete. null means not computable (division by zero).",
    current: periodJson(report.current),
    previous: report.previous ? periodJson(report.previous) : null,
    data_warnings: warnings.map((w) => ({ issue: w.title, campaigns: w.campaigns })),
  };
  return `Analyze this Meta ads data and respond with the JSON object only.\n\n${JSON.stringify(data)}`;
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asStrings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, max) : [];

// প্রোভাইডারভেদে উত্তরে কখনো ```json বা বাড়তি লেখা থাকে; প্রথম { থেকে শেষ } পর্যন্ত নেওয়া হয়
export function parseSummary(text: string): AiSummary {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AiError("AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।");
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।");
  }

  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations
        .map((r) => {
          const item = (r ?? {}) as Record<string, unknown>;
          const priority = ["high", "medium", "low"].includes(item.priority as string)
            ? (item.priority as Priority)
            : "medium";
          return {
            action: asString(item.action),
            campaign: asString(item.campaign) || null,
            reason: asString(item.reason),
            priority,
          };
        })
        .filter((r) => r.action)
        .slice(0, 5)
    : [];

  const summary: AiSummary = {
    headline: asString(raw.headline),
    overview: asString(raw.overview),
    highlights: asStrings(raw.highlights, 4),
    concerns: asStrings(raw.concerns, 4),
    recommendations,
  };

  if (!summary.headline && !summary.overview) {
    throw new AiError("AI খালি উত্তর দিয়েছে। আবার চেষ্টা করো।");
  }
  return summary;
}

// একজন ব্যবহারকারী কত ঘন ঘন সারসংক্ষেপ বানাতে পারবে (AI খরচ নিয়ন্ত্রণ)
const COOLDOWN_MS = 60 * 1000;
const DAILY_LIMIT = 30;

export async function generateAndStoreSummary(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  report: PeriodReport,
  account: { name: string; currency: string | null },
  warnings: DataWarning[],
): Promise<StoredSummary> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("ai_summaries")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false });

  if (recent && recent.length >= DAILY_LIMIT) {
    throw new AiError(`আজকের সীমা (${DAILY_LIMIT}টি সারসংক্ষেপ) শেষ। কাল আবার চেষ্টা করো।`);
  }
  if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < COOLDOWN_MS) {
    throw new AiError("এইমাত্র একটি সারসংক্ষেপ তৈরি হয়েছে। এক মিনিট পরে আবার চেষ্টা করো।");
  }

  if (report.current.campaigns.length === 0) {
    throw new AiError("এই সময়ে কোনো খরচ হয়নি, তাই বিশ্লেষণ করার মতো ডাটা নেই।");
  }

  const cfg = await getActiveAiConfig(supabase);
  const text = await generateText(cfg, {
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(report, account, warnings),
    maxTokens: 8000,
  });
  const content = parseSummary(text);

  const { data, error } = await supabase
    .from("ai_summaries")
    .insert({
      user_id: userId,
      ad_account_id: accountId,
      range_days: report.range,
      provider: cfg.provider,
      model: cfg.model,
      content,
    })
    .select("id, provider, model, content, created_at")
    .single();

  if (error || !data) {
    throw new AiError("সারসংক্ষেপ সংরক্ষণ করা যায়নি।");
  }
  return data as StoredSummary;
}

export async function getLatestSummary(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: number,
): Promise<StoredSummary | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("id, provider, model, content, created_at")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .eq("range_days", range)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StoredSummary | null) ?? null;
}
