import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAiConfig } from "./config";
import { AiError, generateText } from "./providers";
import { makeTr, type Locale } from "@/lib/i18n";
import { assertQuota, getUserPlan, recordUsage } from "@/lib/plans";
import { findInterest, findLocation, SALES_CTAS, type Gender, type LaunchObjective, type LaunchSpec } from "@/lib/meta/launch";

// মালিকের লেখা নির্দেশনা (বাংলা/ইংরেজি/বাংলিশ) থেকে বিজ্ঞাপনের পরিকল্পনা: টার্গেটিং, বাজেট আর লেখা।
// AI শুধু নাম দেয় ("Dhaka", "Leather"); আসল Meta key খুঁজে বসানো হয় Meta-র search দিয়ে।

const SYSTEM_PROMPT = `You turn a Bangladeshi business owner's ad brief into a Meta ad plan.
The brief may be in Bengali, English or Banglish. Follow it exactly; only fill gaps with sensible defaults.

Rules:
- locations: place names in English as Meta knows them (e.g. "Dhaka", "Chattogram", "Sylhet", "Gazipur"). If the brief says the whole country or says nothing, use ["Bangladesh"].
- age_min 18-65, age_max 18-65 (65 means 65+). Default 18-55 if not given.
- gender: "all", "male" or "female".
- interests: up to 6 short English interest names Meta's detailed targeting would have (e.g. "Leather", "Online shopping", "Fashion"). Empty if the brief asks for broad targeting.
- daily_budget: number in the account currency the user gives. Use what the brief says; if missing use the default given below.
- Ad text: write in the language of the brief (Bengali brief -> natural Bangladeshi Bengali). Follow Meta policies: no personal attributes, no fake urgency, no invented prices or discounts; only facts from the brief.
  primary_text up to about 300 characters with the hook first; headline at most 40 characters; description at most 30 characters.
- cta: for sales one of ${SALES_CTAS.join(", ")}; for messages use "MESSAGE_PAGE".
- name: a short campaign name like "Leather Wallet · Dhaka · 25-45 M".
- rules: copy any performance rules the owner wrote (e.g. "cost per purchase over 300 hole bondho") as one short line in the brief's language; empty if none.

Respond with ONLY one JSON object, no markdown:
{"name": string, "locations": string[], "age_min": number, "age_max": number, "gender": "all"|"male"|"female", "interests": string[], "daily_budget": number, "primary_text": string, "headline": string, "description": string, "cta": string, "rules": string}`;

export type BriefInput = {
  brief: string;
  objective: LaunchObjective;
  link: string | null;
  currency: string | null;
  defaultBudget: number;
};

type RawPlan = {
  name?: unknown;
  locations?: unknown;
  age_min?: unknown;
  age_max?: unknown;
  gender?: unknown;
  interests?: unknown;
  daily_budget?: unknown;
  primary_text?: unknown;
  headline?: unknown;
  description?: unknown;
  cta?: unknown;
  rules?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))].slice(0, max) : [];
const clampAge = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(65, Math.max(18, n)) : fallback;
};

export type PlannedLaunch = Omit<LaunchSpec, "page_id" | "pixel_id" | "media"> & { unmatched: string[] };

export async function planFromBrief(
  supabase: SupabaseClient,
  userId: string,
  token: string,
  input: BriefInput,
  locale: Locale,
): Promise<PlannedLaunch> {
  const tr = makeTr(locale);
  await assertQuota(supabase, userId, await getUserPlan(supabase, userId), "ad_copy", tr);

  const cfg = await getActiveAiConfig(supabase);
  const prompt = [
    `Objective: ${input.objective === "sales" ? "website sales (purchases)" : "Messenger messages"}`,
    input.link ? `Website link: ${input.link}` : "",
    `Account currency: ${input.currency ?? "unknown"}. Default daily budget if not in the brief: ${input.defaultBudget}.`,
    `Brief:\n${input.brief}`,
  ]
    .filter(Boolean)
    .join("\n");
  const text = await generateText(cfg, { system: SYSTEM_PROMPT, prompt, maxTokens: 2000 });

  let raw: RawPlan;
  try {
    raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new AiError(tr("Couldn't understand the AI's answer. Please try again.", "AI-এর উত্তর বোঝা যায়নি। আবার চেষ্টা করো।"));
  }
  await recordUsage(supabase, userId, "ad_copy");

  // নামগুলো Meta-র আসল key-তে বদলানো; না মিললে জানানো হয়
  const unmatched: string[] = [];
  const locations: LaunchSpec["locations"] = [];
  for (const q of strList(raw.locations, 10)) {
    const hit = await findLocation(token, q).catch(() => null);
    if (hit && !locations.some((l) => l.key === hit.key)) locations.push(hit);
    else if (!hit) unmatched.push(q);
  }
  const interests: LaunchSpec["interests"] = [];
  for (const q of strList(raw.interests, 6)) {
    const hit = await findInterest(token, q).catch(() => null);
    if (hit && !interests.some((i) => i.id === hit.id)) interests.push({ id: hit.id, name: hit.name });
    else if (!hit) unmatched.push(q);
  }

  const ageMin = clampAge(raw.age_min, 18);
  const ageMax = Math.max(ageMin, clampAge(raw.age_max, 55));
  const gender: Gender = raw.gender === "male" || raw.gender === "female" ? raw.gender : "all";
  const budget = Number(raw.daily_budget);
  const cta = str(raw.cta, 30);

  return {
    name: str(raw.name, 120) || "Hook AI launch",
    objective: input.objective,
    link: input.link,
    daily_budget: Number.isFinite(budget) && budget > 0 ? budget : input.defaultBudget,
    locations: locations.length ? locations : [{ key: "BD", name: "Bangladesh", type: "country" }],
    age_min: ageMin,
    age_max: ageMax,
    gender,
    interests,
    primary_text: str(raw.primary_text, 2000),
    headline: str(raw.headline, 80),
    description: str(raw.description, 60),
    cta: input.objective === "messages" ? "MESSAGE_PAGE" : (SALES_CTAS as readonly string[]).includes(cta) ? cta : "SHOP_NOW",
    rules: str(raw.rules, 500),
    unmatched,
  };
}
