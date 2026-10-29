"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient } from "@/lib/clients";
import { MetaApiError } from "@/lib/meta/graph";
import {
  PRESETS,
  activeAdVideos,
  audienceAccount,
  createLookalike,
  createPreset,
  deleteAudience,
  listAudiences,
  presetName,
  type PresetId,
} from "@/lib/meta/audiences";
import {
  VIDEO_EVENTS,
  WEB_EVENTS,
  adsWithLinks,
  audienceName,
  cleanUrl,
  createVideoAudience,
  createWebAudience,
  productLabel,
  type AdWithLink,
  type VideoKind,
  type WebKind,
} from "@/lib/meta/productAudiences";

export type AudienceState =
  | { ok: true; message: string; lines?: { name: string; ok: boolean; note?: string }[] }
  | { ok: false; error: string }
  | null;

const ID_PATTERN = /^\d{5,25}$/;

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can manage audiences.", "শুধু মালিক অডিয়েন্স বদলাতে পারে।") } as const;
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.selected_ad_account_id) return { error: tr("Pick an ad account first.", "আগে Ad Account বেছে নাও।") } as const;
  const scope = await accountInCurrentClient(supabase, user.id, c.selected_ad_account_id);
  if (!scope.ok) return { error: tr("Pick one of this client's ad accounts first.", "আগে এই ক্লায়েন্টের একটা Ad Account বাছো।") } as const;
  return { tr, token: decrypt(c.access_token_encrypted), accountId: c.selected_ad_account_id as string };
}

function metaMessage(err: unknown) {
  return err instanceof MetaApiError || err instanceof Error ? err.message.slice(0, 250) : "error";
}

// এক ক্লিকে রিটার্গেটিং সেট: বাছা অডিয়েন্সগুলো বানানো (আগে থেকে থাকলে বাদ)
export async function createRetargetingSet(_prev: AudienceState, formData: FormData): Promise<AudienceState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, token, accountId } = ctx;

  const pixelId = String(formData.get("pixel_id") ?? "");
  const pixelName = String(formData.get("pixel_name") ?? "").slice(0, 60);
  const pageId = String(formData.get("page_id") ?? "");
  const pageName = String(formData.get("page_name") ?? "").slice(0, 60);
  const chosen = new Set(formData.getAll("presets").map(String));
  const presets = PRESETS.filter((p) => chosen.has(p.id));
  if (presets.length === 0) return { ok: false, error: tr("Tick at least one audience.", "অন্তত একটা অডিয়েন্সে টিক দাও।") };
  if (presets.some((p) => p.needs === "pixel") && !ID_PATTERN.test(pixelId)) return { ok: false, error: tr("Pick a pixel.", "একটা Pixel বাছো।") };
  if (presets.some((p) => p.needs === "page") && !ID_PATTERN.test(pageId)) return { ok: false, error: tr("Pick a page.", "একটা পেজ বাছো।") };

  let existing: Set<string>;
  try {
    existing = new Set((await listAudiences(token, accountId)).map((a) => a.name));
  } catch (err) {
    return { ok: false, error: tr(`Meta refused: ${metaMessage(err)}`, `Meta গ্রহণ করেনি: ${metaMessage(err)}`) };
  }
  const videos = presets.some((p) => p.needs === "videos") ? await activeAdVideos(token, accountId).catch(() => []) : [];

  const lines: { name: string; ok: boolean; note?: string }[] = [];
  for (const p of presets) {
    const label = p.needs === "pixel" ? pixelName || pixelId : p.needs === "page" ? pageName || pageId : tr("active ad videos", "চালু বিজ্ঞাপনের ভিডিও");
    const name = presetName(p, label);
    const shown = tr(p.name[0], p.name[1]);
    if (existing.has(name)) {
      lines.push({ name: shown, ok: true, note: tr("already exists", "আগে থেকেই আছে") });
      continue;
    }
    if (p.needs === "videos" && videos.length === 0) {
      lines.push({ name: shown, ok: false, note: tr("no active video ads", "চালু কোনো ভিডিও বিজ্ঞাপন নেই") });
      continue;
    }
    try {
      await createPreset(token, accountId, p, { pixelId, pageId, videoIds: videos, label });
      lines.push({ name: shown, ok: true, note: tr("created", "তৈরি হয়েছে") });
    } catch (err) {
      lines.push({ name: shown, ok: false, note: metaMessage(err) });
    }
  }
  revalidatePath("/audiences");
  const made = lines.filter((l) => l.ok).length;
  return { ok: true, message: tr(`${made} of ${lines.length} ready.`, `${lines.length}টির মধ্যে ${made}টি তৈরি।`), lines };
}

export async function makeLookalike(_prev: AudienceState, formData: FormData): Promise<AudienceState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, token, accountId } = ctx;
  const id = String(formData.get("id") ?? "");
  const percent = Number(formData.get("percent") ?? 1);
  if (!ID_PATTERN.test(id) || !Number.isFinite(percent)) return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  try {
    const src = await audienceAccount(token, id);
    if (src.account_id && `act_${src.account_id}` !== accountId) return { ok: false, error: tr("This audience belongs to another ad account.", "এই অডিয়েন্স অন্য Ad Account-এর।") };
    await createLookalike(token, accountId, { id, name: src.name }, percent);
  } catch (err) {
    const msg = metaMessage(err);
    if (/too small|at least 100|source audience/i.test(msg)) {
      return { ok: false, error: tr("The source needs at least 100 people. Wait until it grows.", "উৎস অডিয়েন্সে অন্তত ১০০ জন লাগে। আরও বড় হওয়া পর্যন্ত অপেক্ষা করো।") };
    }
    return { ok: false, error: tr(`Meta refused: ${msg}`, `Meta গ্রহণ করেনি: ${msg}`) };
  }
  revalidatePath("/audiences");
  return { ok: true, message: tr("Lookalike created. Meta fills it within a few hours.", "Lookalike তৈরি হয়েছে। Meta কয়েক ঘণ্টার মধ্যে ভরে দেবে।") };
}

export async function removeAudience(formData: FormData) {
  const ctx = await context();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!ID_PATTERN.test(id)) return;
  try {
    const a = await audienceAccount(ctx.token, id);
    if (a.account_id && `act_${a.account_id}` !== ctx.accountId) return;
    await deleteAudience(ctx.token, id);
  } catch (err) {
    console.error("audience delete failed", metaMessage(err));
  }
  revalidatePath("/audiences");
}

export type { PresetId };

// ---------- প্রোডাক্ট ধরে অডিয়েন্স ----------

export type ProductLookup =
  | { ok: true; label: string; whole: boolean; ads: AdWithLink[] }
  | { ok: false; error: string };

// ধাপ ১: লিংক দিলে অ্যাকাউন্টের বিজ্ঞাপনগুলো, কোনগুলো এই লিংকের তা চিহ্নসহ
export async function findProductAds(url: string): Promise<ProductLookup> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, token, accountId } = ctx;
  const target = cleanUrl(url.slice(0, 500));
  if (!target || !target.host.includes(".")) return { ok: false, error: tr("Enter a website or product link.", "ওয়েবসাইট বা প্রোডাক্টের লিংক দাও।") };
  try {
    return { ok: true, label: productLabel(url), whole: target.whole, ads: await adsWithLinks(token, accountId, url) };
  } catch (err) {
    return { ok: false, error: tr(`Meta refused: ${metaMessage(err)}`, `Meta গ্রহণ করেনি: ${metaMessage(err)}`) };
  }
}

// Meta-র Custom Audience শর্তে রাজি না হলে ওয়েবসাইট অডিয়েন্স হয় না; মালিককে নিজে রাজি হতে হয়
function termsLink(msg: string) {
  return msg.match(/https:\/\/www\.facebook\.com\/customaudiences\/app\/tos\/\?act=\d+/)?.[0] ?? null;
}

export type ProductAudienceState =
  | { ok: true; message: string; lines: { name: string; ok: boolean; note?: string }[]; termsUrl?: string | null }
  | { ok: false; error: string }
  | null;

// ধাপ ২: বাছা বিজ্ঞাপনের ভিডিও আর বাছা ওয়েবসাইট ইভেন্ট থেকে অডিয়েন্সগুলো বানানো (আগে থেকে থাকলে বাদ)
export async function createProductAudiences(_prev: ProductAudienceState, formData: FormData): Promise<ProductAudienceState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, token, accountId } = ctx;

  const url = String(formData.get("url") ?? "").slice(0, 500);
  const label = String(formData.get("label") ?? "").trim().slice(0, 60) || productLabel(url);
  const adIds = new Set(formData.getAll("ads").map(String).filter((x) => ID_PATTERN.test(x)));
  const videoKinds = formData.getAll("video").map(String).filter((k): k is VideoKind => k in VIDEO_EVENTS);
  const webKinds = formData.getAll("web").map(String).filter((k): k is WebKind => k in WEB_EVENTS);
  const videoDays = Math.min(365, Math.max(1, Math.round(Number(formData.get("video_days")) || 30)));
  const webDays = Math.min(180, Math.max(1, Math.round(Number(formData.get("web_days")) || 30)));
  const pixelId = String(formData.get("pixel_id") ?? "");
  if (!cleanUrl(url)) return { ok: false, error: tr("Enter the link first.", "আগে লিংক দাও।") };
  if (videoKinds.length + webKinds.length === 0) return { ok: false, error: tr("Tick at least one audience.", "অন্তত একটা অডিয়েন্সে টিক দাও।") };
  if (videoKinds.length && adIds.size === 0) return { ok: false, error: tr("Tick the ads whose video viewers you want.", "যেসব বিজ্ঞাপনের ভিডিও দর্শক চাও, সেগুলোতে টিক দাও।") };
  if (webKinds.length && !ID_PATTERN.test(pixelId)) return { ok: false, error: tr("Pick a pixel for website audiences.", "ওয়েবসাইট অডিয়েন্সের জন্য Pixel বাছো।") };

  let existing: Set<string>;
  let videos: string[] = [];
  try {
    existing = new Set((await listAudiences(token, accountId)).map((a) => a.name));
    // ভিডিওর আইডি আবার Meta থেকে নেওয়া (ব্রাউজারের পাঠানো আইডি বিশ্বাস না করে)
    if (videoKinds.length) videos = [...new Set((await adsWithLinks(token, accountId, url)).filter((a) => adIds.has(a.id)).flatMap((a) => a.videos))];
  } catch (err) {
    return { ok: false, error: tr(`Meta refused: ${metaMessage(err)}`, `Meta গ্রহণ করেনি: ${metaMessage(err)}`) };
  }

  const lines: { name: string; ok: boolean; note?: string }[] = [];
  let termsUrl: string | null = null;
  const run = async (name: string, shown: string, make: () => Promise<unknown>) => {
    if (existing.has(name)) return lines.push({ name: shown, ok: true, note: tr("already exists", "আগে থেকেই আছে") });
    try {
      await make();
      lines.push({ name: shown, ok: true, note: tr("created", "তৈরি হয়েছে") });
    } catch (err) {
      const msg = metaMessage(err);
      termsUrl ??= termsLink(msg);
      lines.push({
        name: shown,
        ok: false,
        note: termsLink(msg) ? tr("accept Meta's Custom Audience terms first (link below)", "আগে Meta-র Custom Audience শর্তে রাজি হতে হবে (নিচের লিংক)") : msg,
      });
    }
  };

  for (const k of videoKinds) {
    const v = VIDEO_EVENTS[k];
    const shown = `${tr(v.label[0], v.label[1])} · ${videoDays}${tr("d", " দিন")}`;
    if (videos.length === 0) {
      lines.push({ name: shown, ok: false, note: tr("the ticked ads have no video", "বাছা বিজ্ঞাপনে কোনো ভিডিও নেই") });
      continue;
    }
    await run(audienceName(label, `Video ${v.label[0]}`, videoDays), shown, () => createVideoAudience(token, accountId, audienceName(label, `Video ${v.label[0]}`, videoDays), k, videos, videoDays));
  }
  for (const k of webKinds) {
    const w = WEB_EVENTS[k];
    const shown = `${tr(w.label[0], w.label[1])} · ${webDays}${tr("d", " দিন")}`;
    const name = audienceName(label, `Web ${w.label[0]}`, webDays);
    await run(name, shown, () => createWebAudience(token, accountId, name, k, pixelId, url, webDays));
  }

  revalidatePath("/audiences");
  const made = lines.filter((l) => l.ok).length;
  return { ok: true, message: tr(`${made} of ${lines.length} ready. Meta fills them over the next hours.`, `${lines.length}টির মধ্যে ${made}টি তৈরি। Meta কয়েক ঘণ্টায় ভরে দেবে।`), lines, termsUrl };
}
