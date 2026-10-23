import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAiConfig } from "./config";
import { generateText } from "./providers";
import { parseSummary, type AiSummary } from "./summary";
import { parseCampaignReport, type CampaignReport } from "./campaignReport";
import type { Locale } from "@/lib/i18n";

// জমা থাকা রিপোর্টকে অন্য ভাষায় অনুবাদ করে। সংখ্যা, মেট্রিকের নাম ও ক্যাম্পেইনের নাম একই থাকে।

const TARGET: Record<Locale, string> = {
  en: "plain, friendly English addressing the reader as \"you\"",
  bn: "simple, friendly Bengali (Bangla script) addressing the reader as \"তুমি\"",
};

const systemPrompt = (to: Locale) => `You translate a Meta ads report stored as JSON into ${TARGET[to]}.
Rules:
- Return the SAME JSON structure with the same keys, the same number of array items and the same order.
- Translate only human-readable text values. Keep numbers, currency amounts, percentages, dates, metric names (Spend, Result, Cost per Result, CTR, ROAS, CPM, CPC, Purchase, Lead, ThruPlay, Hook rate, Hold rate, Frequency, Reach) and campaign or ad account names exactly as they are.
- Keep "priority" values exactly as they are ("high", "medium", "low").
- Do not add, remove or change any facts.
Respond with ONLY the JSON object, no markdown.`;

export async function translateReport<T extends AiSummary | CampaignReport>(
  supabase: SupabaseClient,
  kind: "summary" | "campaign",
  content: T,
  to: Locale,
): Promise<T> {
  // অনুবাদের দরকার নেই এমন অংশ AI-তে পাঠানো হয় না, পরে আবার জুড়ে দেওয়া হয়
  const { locale: _from, account_name, campaigns, ...rest } = content as AiSummary & { campaigns?: string[] };
  void _from;
  const cfg = await getActiveAiConfig(supabase);
  const text = await generateText(cfg, {
    system: systemPrompt(to),
    prompt: JSON.stringify(rest),
    maxTokens: 10000,
  });
  const parsed = kind === "summary" ? parseSummary(text, to) : parseCampaignReport(text, to);
  return { ...parsed, ...(account_name ? { account_name } : {}), ...(campaigns ? { campaigns } : {}), locale: to } as T;
}
