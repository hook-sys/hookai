import type { SupabaseClient } from "@supabase/supabase-js";
import type { DerivedMetrics, Totals } from "@/lib/metrics";
import type { DataWarning, PeriodReport, PeriodStats } from "@/lib/insights/report";
import { getActiveAiConfig } from "./config";
import { AiError, generateText } from "./providers";
import { makeTr, type Locale } from "@/lib/i18n";

export type Priority = "high" | "medium" | "low";

export type AiSummary = {
  // কোন ভাষায় লেখা (পুরনো সারসংক্ষেপে নেই, সেগুলো বাংলা)
  locale?: Locale;
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

// ভাষাভেদে লেখার নিয়ম; বাকি নির্দেশ একই
const LANGUAGE_RULES: Record<Locale, string> = {
  bn: `- Write EVERY text field in simple, friendly Bengali (Bangla), including recommendation "action". Keep only metric names (Spend, Cost per Purchase, ROAS, CTR, CPC, CPM, Purchase, Lead) and campaign names exactly as given.
- Address the reader as "তুমি".
- Refer to the period by its dates (current.date_from to current.date_to) or as "এই সময়ে". Never call it "আজ" / "আজকে" unless includes_today_incomplete_data is true, and never call it "সপ্তাহ" unless it is exactly 7 days.
- Example actions: "বাজেট ২০% বাড়াও", "ক্যাম্পেইন বন্ধ করো", "নতুন ক্রিয়েটিভ পরীক্ষা করো", "Purchase ট্র্যাকিং ঠিক করো".`,
  en: `- Write EVERY text field in plain, friendly English that a busy shop owner understands. Keep metric names (Spend, Cost per Purchase, ROAS, CTR, CPC, CPM, Purchase, Lead) and campaign names exactly as given.
- Address the reader as "you".
- Refer to the period by its dates (current.date_from to current.date_to) or as "in this period". Never call it "today" unless includes_today_incomplete_data is true, and never call it "this week" unless it is exactly 7 days.
- Example actions: "Raise the budget by 20%", "Pause this campaign", "Test a new creative", "Fix purchase tracking".`,
};

// AI-কে শুধু ব্যাখ্যা করতে দেওয়া হয়; সব সংখ্যা কোডে হিসাব করা এবং এখান থেকেই যায়
const systemPrompt = (locale: Locale) => `You are a senior Meta (Facebook/Instagram) ads performance analyst helping a small business owner in Bangladesh.

You receive ad performance data as JSON. All numbers are already calculated correctly by code.

Rules:
- Use ONLY numbers present in the data. Never invent, estimate or recalculate figures.
${LANGUAGE_RULES[locale]}
- "headline": one specific sentence with the single most important takeaway and a number (not a generic title like "performance report").
- If "previous" is present, compare current vs previous period and mention the important changes with numbers.
- If "includes_today_incomplete_data" is true, today is still running: do not treat lower totals as a decline, and say the numbers are partial.

Unreliable data:
- "data_warnings" lists campaigns whose purchase value (and therefore ROAS) is unreliable, per period.
- For those campaigns and for the account totals they affect, NEVER mention ROAS or purchase value as good news or as a reason for any action. Judge them on Cost per Purchase, Purchase count, CTR and Cost per Lead instead.
- Put fixing the tracking in "concerns" and as one recommendation.

Recommendations:
- Only for campaigns listed in "current.campaigns" (they are running now). Never recommend actions for campaigns that only appear in "previous".
- "action" is a short instruction in the language above. Use "campaign": null only for account-wide actions.
- Each "reason" cites the specific numbers behind it.
- "high" priority only for money being wasted now or broken tracking.

Be concise: overview 2-3 sentences; at most 4 highlights, 4 concerns and 5 recommendations.

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

export type PeriodWarnings = { current: DataWarning[]; previous: DataWarning[] };

export function buildPrompt(
  report: PeriodReport,
  account: { name: string; currency: string | null; today: string },
  warnings: PeriodWarnings,
) {
  const warningJson = (period: string, list: DataWarning[]) =>
    list.map((w) => ({ period, issue: w.title, campaigns: w.campaigns }));

  const data = {
    ad_account: account.name,
    currency: account.currency ?? "unknown",
    period_days: report.days,
    note: "null means not computable (division by zero).",
    // আজকের দিন চলমান, তাই আজ থাকলে সংখ্যা কম দেখানো স্বাভাবিক
    includes_today_incomplete_data: report.current.until >= account.today,
    current: periodJson(report.current),
    previous: report.previous ? periodJson(report.previous) : null,
    data_warnings: [
      ...warningJson("current", warnings.current),
      ...warningJson("previous", warnings.previous),
    ],
  };
  return `Analyze this Meta ads data and respond with the JSON object only.\n\n${JSON.stringify(data)}`;
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asStrings = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, max) : [];

// প্রোভাইডারভেদে উত্তরে কখনো ```json বা বাড়তি লেখা থাকে; প্রথম { থেকে শেষ } পর্যন্ত নেওয়া হয়
export function parseSummary(text: string, locale: Locale = "en"): AiSummary {
  const tr = makeTr(locale);
  const unreadable = tr("Couldn't understand the AI's answer. Please try again.", "AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AiError(unreadable);
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError(unreadable);
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
    locale,
    headline: asString(raw.headline),
    overview: asString(raw.overview),
    highlights: asStrings(raw.highlights, 4),
    concerns: asStrings(raw.concerns, 4),
    recommendations,
  };

  if (!summary.headline && !summary.overview) {
    throw new AiError(tr("The AI returned an empty answer. Please try again.", "AI খালি উত্তর দিয়েছে। আবার চেষ্টা করো।"));
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
  account: { name: string; currency: string | null; today: string },
  warnings: PeriodWarnings,
  locale: Locale = "en",
): Promise<StoredSummary> {
  const tr = makeTr(locale);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("ai_summaries")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false });

  if (recent && recent.length >= DAILY_LIMIT) {
    throw new AiError(
      tr(
        `You've used today's limit of ${DAILY_LIMIT} summaries. Try again tomorrow.`,
        `আজকের সীমা (${DAILY_LIMIT}টি সারসংক্ষেপ) শেষ। কাল আবার চেষ্টা করো।`,
      ),
    );
  }
  if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < COOLDOWN_MS) {
    throw new AiError(
      tr("A summary was just created. Try again in a minute.", "এইমাত্র একটি সারসংক্ষেপ তৈরি হয়েছে। এক মিনিট পরে আবার চেষ্টা করো।"),
    );
  }

  if (report.current.campaigns.length === 0) {
    throw new AiError(
      tr("Nothing was spent in this period, so there's nothing to analyze.", "এই সময়ে কোনো খরচ হয়নি, তাই বিশ্লেষণ করার মতো ডাটা নেই।"),
    );
  }

  const cfg = await getActiveAiConfig(supabase);
  const text = await generateText(cfg, {
    system: systemPrompt(locale),
    prompt: buildPrompt(report, account, warnings),
    maxTokens: 8000,
  });
  const parsed = parseSummary(text, locale);

  // AI নির্দেশ না মানলেও এখন বন্ধ থাকা ক্যাম্পেইনের সুপারিশ ব্যবহারকারী দেখবে না
  const running = new Set(report.current.campaigns.map((c) => c.name.trim().toLowerCase()));
  const content: AiSummary = {
    ...parsed,
    recommendations: parsed.recommendations.filter(
      (r) => r.campaign === null || running.has(r.campaign.trim().toLowerCase()),
    ),
  };

  const { data, error } = await supabase
    .from("ai_summaries")
    .insert({
      user_id: userId,
      ad_account_id: accountId,
      date_from: report.current.since,
      date_to: report.current.until,
      provider: cfg.provider,
      model: cfg.model,
      content,
    })
    .select("id, provider, model, content, created_at")
    .single();

  if (error || !data) {
    throw new AiError(tr("Couldn't save the summary.", "সারসংক্ষেপ সংরক্ষণ করা যায়নি।"));
  }
  return data as StoredSummary;
}

export async function getLatestSummary(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: { since: string; until: string },
  locale: Locale = "en",
): Promise<StoredSummary | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("id, provider, model, content, created_at")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .eq("date_from", range.since)
    .eq("date_to", range.until)
    .order("created_at", { ascending: false })
    .limit(10);
  // বেছে নেওয়া ভাষায় লেখা সর্বশেষটি (locale নেই মানে পুরনো, বাংলা)
  const list = (data ?? []) as StoredSummary[];
  return list.find((s) => (s.content.locale ?? "bn") === locale) ?? null;
}
