import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAiConfig } from "./config";
import { AiError, generateText } from "./providers";
import { makeTr, type Locale } from "@/lib/i18n";
import { assertQuota, getUserPlan, recordUsage } from "@/lib/plans";

import {
  CTA_TYPES,
  LIMITS,
  type AdCopy,
  type AdCopyInput,
  type CopyLanguage,
  type CtaType,
  type Objective,
  type StoredAdCopy,
  type Tone,
} from "./adCopyShared";

export * from "./adCopyShared";

// Meta অ্যাডের লেখা: Primary text, Headline, Description আর CTA বাটনের পরামর্শ

const LANGUAGE_RULE: Record<CopyLanguage, string> = {
  en: "Write in natural, conversational English.",
  bn: "Write in natural Bengali (Bangla script) the way Bangladeshi Facebook shoppers talk. Keep brand names, prices and product terms people say in English (e.g. COD, free delivery, size, combo) as they are.",
  banglish:
    "Write in Banglish: Bengali words in Latin letters mixed with common English, the way people type on Facebook in Bangladesh (e.g. 'Ajkei order korun, stock limited!').",
};

const TONE_RULE: Record<Tone, string> = {
  friendly: "Warm and helpful, like a trusted local shop.",
  urgent: "Create honest urgency (limited stock, offer ending) without false claims.",
  premium: "Calm, confident and high quality; no shouting, few emojis.",
  playful: "Light, fun and energetic; a few fitting emojis are fine.",
};

const OBJECTIVE_RULE: Record<Objective, string> = {
  sales: "Goal: website or inbox orders. Push toward buying now.",
  messages: "Goal: people send a message on Messenger or WhatsApp. Invite them to message for price or order.",
  leads: "Goal: people fill in a form. Make the value of signing up clear.",
  traffic: "Goal: people visit the website. Give a clear reason to click.",
};

const SYSTEM_PROMPT = `You are an experienced Meta (Facebook/Instagram) ad copywriter for small businesses in Bangladesh.

Write ad copy for the product described by the user. Follow Meta advertising policies:
- No personal attributes ("Are you overweight?", "Are you single?"), no before/after promises, no guaranteed results, no misleading prices or fake urgency, no sensational claims.
- Only use facts the user gave (price, offer, delivery). Never invent prices, discounts, ratings or guarantees.
- Never claim limited stock, a deadline or "last chance" unless the user's text says so.

Output:
- primary_texts: exactly 3 different angles (for example the problem it solves, the offer, social proof or trust). Put the hook in the first line. Aim for at most ${LIMITS.primary} characters for the first 2 lines; total can be up to about 400 characters with short lines and an emoji or two where the tone allows.
- headlines: exactly 5, each at most ${LIMITS.headline} characters.
- descriptions: exactly 2, each at most ${LIMITS.description} characters.
- ctas: 2 or 3 best call-to-action buttons for the goal, best first, chosen only from: ${CTA_TYPES.join(", ")}.

Respond with ONLY one JSON object, no markdown:
{"primary_texts": string[], "headlines": string[], "descriptions": string[], "ctas": string[]}`;

function buildPrompt(input: AdCopyInput) {
  return [
    `Product and offer: ${input.product}`,
    input.audience ? `Audience: ${input.audience}` : "Audience: not specified; write for a broad Bangladeshi audience.",
    OBJECTIVE_RULE[input.objective],
    `Language: ${LANGUAGE_RULE[input.language]}`,
    `Tone: ${TONE_RULE[input.tone]}`,
  ].join("\n");
}

const strs = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim()).slice(0, max) : [];

export function parseAdCopy(text: string, locale: Locale = "en"): AdCopy {
  const tr = makeTr(locale);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError(tr("Couldn't understand the AI's answer. Please try again.", "AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।"));
  }
  const copy: AdCopy = {
    primary_texts: strs(raw.primary_texts, 3),
    headlines: strs(raw.headlines, 5),
    descriptions: strs(raw.descriptions, 2),
    ctas: strs(raw.ctas, 3).filter((c): c is CtaType => (CTA_TYPES as readonly string[]).includes(c)),
  };
  if (copy.primary_texts.length === 0 && copy.headlines.length === 0) {
    throw new AiError(tr("The AI returned an empty answer. Please try again.", "AI খালি উত্তর দিয়েছে। আবার চেষ্টা করো।"));
  }
  return copy;
}

export async function generateAdCopy(
  supabase: SupabaseClient,
  userId: string,
  input: AdCopyInput,
  locale: Locale,
): Promise<StoredAdCopy> {
  const tr = makeTr(locale);
  await assertQuota(supabase, userId, await getUserPlan(supabase, userId), "ad_copy", tr);

  const cfg = await getActiveAiConfig(supabase);
  const text = await generateText(cfg, { system: SYSTEM_PROMPT, prompt: buildPrompt(input), maxTokens: 4000 });
  const content = parseAdCopy(text, locale);
  await recordUsage(supabase, userId, "ad_copy");

  const { data, error } = await supabase
    .from("ad_copies")
    .insert({ user_id: userId, input, content, provider: cfg.provider, model: cfg.model })
    .select("id, input, content, model, created_at")
    .single();
  if (error || !data) throw new AiError(tr("Couldn't save the ad copy.", "অ্যাডের লেখা সংরক্ষণ করা যায়নি।"));
  return data as StoredAdCopy;
}

export async function listAdCopies(supabase: SupabaseClient, userId: string, limit = 10) {
  const { data } = await supabase
    .from("ad_copies")
    .select("id, input, content, model, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as StoredAdCopy[];
}
