import type { SupabaseClient } from "@supabase/supabase-js";
import { SALES_CTAS, type Gender, type LaunchObjective, type LaunchSpec } from "@/lib/meta/launch";
import { DriveError, campaignAds, driveFileInfo, parseDriveLink } from "@/lib/meta/launchSources";
import { listAudiences } from "@/lib/meta/audiences";
import { ruleTemplates } from "@/lib/rules/types";
import { getActiveAiConfig } from "@/lib/ai/config";
import { generateText } from "@/lib/ai/providers";
import type { ClientProfile } from "@/lib/clientProfile";

// AI ছাড়া নতুন বিজ্ঞাপন: কনটেন্ট (Drive লিংক বা আগের ক্যাম্পেইন) আর সেটিং দিয়ে সরাসরি খসড়া।
// ফর্ম আর AI সহকারী দুটোই এটা দিয়ে খসড়া বানায়, তাই ফল একই।

export type QuickContent =
  | { source: "drive"; links: string[] }
  | { source: "campaign"; campaign_id: string; ad_ids: string[]; mode: "post" | "media" };

export type QuickInput = {
  name?: string;
  objective: LaunchObjective;
  page_id: string;
  page_name?: string;
  pixel_id?: string | null;
  link?: string | null;
  daily_budget: number;
  age_min: number;
  age_max: number;
  gender: Gender;
  locations: LaunchSpec["locations"];
  interests: LaunchSpec["interests"];
  audience: "broad" | "new" | "retarget";
  include_audiences: { id: string; name: string }[];
  content: QuickContent;
  copy: { primary_text?: string; headline?: string; description?: string; cta?: string };
  rule_templates: string[];
  rule_target: number | null;
};

export class QuickError extends Error {}

const ID = /^\d{5,25}$/;
const RULE_IDS = new Set(ruleTemplates(1).map((t) => t.id));

export async function buildQuickSpec(token: string, accountId: string, input: QuickInput): Promise<LaunchSpec> {
  if (!ID.test(input.page_id)) throw new QuickError("Pick a Facebook page.");
  if (input.objective === "sales" && !ID.test(input.pixel_id ?? "")) throw new QuickError("Pick a pixel.");
  if (!(input.daily_budget > 0)) throw new QuickError("Enter a daily budget above 0.");

  // ---- কনটেন্ট ----
  const media: LaunchSpec["media"] = [];
  let reused: { body: string | null; title: string | null; description: string | null; link: string | null; cta: string | null } | null = null;
  if (input.content.source === "drive") {
    const links = input.content.links.map((l) => l.trim()).filter(Boolean).slice(0, 5);
    if (links.length === 0) throw new QuickError("Paste at least one Google Drive link.");
    for (const l of links) {
      const p = parseDriveLink(l);
      if (!p) throw new QuickError(`Not a Google Drive link: ${l.slice(0, 80)}`);
      if (p.folder) throw new QuickError("Folder links need a Google API key; paste the file links for now.");
      try {
        const f = await driveFileInfo(p.id);
        media.push({ path: `drive:${f.id}`, kind: f.kind, name: f.name, thumb: f.thumb });
      } catch (err) {
        throw new QuickError(`${l.slice(0, 60)}… ${err instanceof DriveError ? err.message : "couldn't be read"}`);
      }
    }
  } else {
    const ads = await campaignAds(token, accountId, input.content.campaign_id);
    const chosen = ads.filter((a) => input.content.source === "campaign" && input.content.ad_ids.includes(a.id)).slice(0, 5);
    if (chosen.length === 0) throw new QuickError("Tick at least one ad from the campaign.");
    for (const a of chosen) {
      if (input.content.mode === "post") {
        if (!a.post_id) throw new QuickError(`${a.name}: this ad has no post to reuse.`);
        media.push({ path: `post:${a.post_id}`, kind: a.video_id ? "video" : "image", name: a.name.slice(0, 100), thumb: a.thumb });
      } else if (a.video_id) media.push({ path: `video:${a.video_id}`, kind: "video", name: a.name.slice(0, 100), thumb: a.thumb });
      else if (a.image_hash) media.push({ path: `image:${a.image_hash}`, kind: "image", name: a.name.slice(0, 100), thumb: a.thumb });
      else throw new QuickError(`${a.name}: no video or image found in this ad.`);
    }
    reused = chosen[0];
  }

  // ---- লেখা: যা দেওয়া হয়েছে, না হলে আগের বিজ্ঞাপনের ----
  const primary = (input.copy.primary_text?.trim() || reused?.body || "").slice(0, 2000);
  const headline = (input.copy.headline?.trim() || reused?.title || "").slice(0, 80);
  const description = (input.copy.description?.trim() || reused?.description || "").slice(0, 60);
  const usesPost = input.content.source === "campaign" && input.content.mode === "post";
  if (!usesPost && (!primary || !headline)) throw new QuickError("Write the primary text and headline (or let AI write them).");
  const link = input.objective === "sales" ? input.link?.trim() || reused?.link || null : null;
  if (input.objective === "sales" && !usesPost && !link) throw new QuickError("Enter the website link.");
  const ctaRaw = input.copy.cta || reused?.cta || "SHOP_NOW";
  const cta = input.objective === "messages" ? "MESSAGE_PAGE" : (SALES_CTAS as readonly string[]).includes(ctaRaw) ? ctaRaw : "SHOP_NOW";

  // ---- অডিয়েন্স ----
  let exclude: { id: string; name: string }[] = [];
  if (input.audience !== "broad") {
    const list = await listAudiences(token, accountId).catch(() => []);
    // নতুন ক্রেতা চাইলে, আর রিটার্গেটেও, আগের ক্রেতাদের বাদ
    exclude = list.filter((a) => /Buyers|ক্রেতা|· Web Bought/i.test(a.name) && a.subtype !== "LOOKALIKE").map((a) => ({ id: a.id, name: a.name }));
  }
  const include = input.audience === "retarget" ? input.include_audiences.filter((a) => ID.test(a.id)).slice(0, 20) : [];
  if (input.audience === "retarget" && include.length === 0) throw new QuickError("Pick the audiences to retarget.");

  const ageMin = Math.min(65, Math.max(18, Math.round(input.age_min)));
  const ageMax = Math.max(ageMin, Math.min(65, Math.round(input.age_max)));
  const rules = input.rule_templates.filter((r) => RULE_IDS.has(r));

  return {
    name: (input.name?.trim() || `${headline || media[0].name} · ${new Date().toISOString().slice(0, 10)}`).slice(0, 120),
    objective: input.objective,
    page_id: input.page_id,
    page_name: input.page_name,
    pixel_id: input.objective === "sales" ? input.pixel_id : null,
    link,
    daily_budget: input.daily_budget,
    locations: input.locations.length ? input.locations : [{ key: "BD", name: "Bangladesh", type: "country" }],
    age_min: ageMin,
    age_max: ageMax,
    gender: input.gender,
    interests: input.audience === "retarget" ? [] : input.interests,
    include_audiences: include,
    exclude_audiences: exclude.filter((e) => !include.some((i) => i.id === e.id)),
    primary_text: primary || headline || " ",
    headline: headline || " ",
    description,
    cta,
    media,
    rule_templates: rules,
    rule_target: rules.length && input.rule_target && input.rule_target > 0 ? input.rule_target : null,
  };
}

// "AI দিয়ে লেখাও": প্রোফাইলের ব্যবসার তথ্য আর নোট থেকে বিজ্ঞাপনের লেখা (রিপোর্ট/লেখার মডেলে)
export async function writeAdCopy(
  supabase: SupabaseClient,
  input: { profile?: ClientProfile; link?: string | null; notes?: string; objective: LaunchObjective },
) {
  const cfg = await getActiveAiConfig(supabase, "report");
  const lang = input.profile?.language === "en" ? "English" : "natural Bangladeshi Bengali";
  const text = await generateText(cfg, {
    system: `You write Meta ad copy for a Bangladeshi business in ${lang}. Use only facts given; never invent prices, discounts or claims. Follow Meta policies (no personal attributes, no fake urgency).
Return ONLY JSON: {"primary_text": string (hook first, up to ~300 chars), "headline": string (max 40 chars), "description": string (max 30 chars)}`,
    prompt: [
      `Goal: ${input.objective === "sales" ? "website sales" : "Messenger messages"}`,
      input.link ? `Product link: ${input.link}` : "",
      input.profile?.about ? `Business facts and tone:\n${input.profile.about}` : "",
      input.notes ? `Owner notes:\n${input.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 1500,
  });
  try {
    const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    return { primary_text: s(raw.primary_text, 2000), headline: s(raw.headline, 80), description: s(raw.description, 60) };
  } catch {
    throw new QuickError("The AI's answer couldn't be read. Try again.");
  }
}
