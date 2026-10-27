"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale, getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/providers";
import { accountInCurrentClient, currentClient } from "@/lib/clients";
import { clearLiveCache } from "@/lib/insights/live";
import { MetaApiError } from "@/lib/meta/graph";
import { setDeliveryStatus } from "@/lib/meta/manage";
import { planFromBrief } from "@/lib/ai/launchBrief";
import { SALES_CTAS, searchInterests, searchLocations, type LaunchSpec } from "@/lib/meta/launch";
import { runLaunch, type LaunchMeta, type LaunchRow } from "@/lib/meta/launchRun";

export type LaunchState = { ok: true; message: string } | { ok: false; error: string } | null;

const ID_PATTERN = /^\d{5,25}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_MEDIA = 5;

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can launch ads.", "শুধু মালিক বিজ্ঞাপন চালু করতে পারে।") } as const;
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.selected_ad_account_id) return { error: tr("Pick an ad account first.", "আগে Ad Account বেছে নাও।") } as const;
  const scope = await accountInCurrentClient(supabase, user.id, c.selected_ad_account_id);
  if (!scope.ok) return { error: tr("Pick one of this client's ad accounts first.", "আগে এই ক্লায়েন্টের একটা Ad Account বাছো।") } as const;
  return {
    tr,
    supabase,
    user,
    token: decrypt(c.access_token_encrypted),
    accountId: c.selected_ad_account_id as string,
    currency: c.selected_ad_account_currency as string | null,
  };
}

function metaError(err: unknown, tr: (en: string, bn: string) => string) {
  const msg = err instanceof MetaApiError || err instanceof Error ? err.message : "";
  if (/development mode/i.test(msg)) {
    return tr(
      "Meta only allows new ads from apps that are Live. Switch the Hook AI Meta app to Live, then try again.",
      "Meta শুধু Live অ্যাপ থেকে নতুন বিজ্ঞাপন বানাতে দেয়। Hook AI-এর Meta অ্যাপটা Live করে আবার চেষ্টা করো।",
    );
  }
  if (/\(#200\)|\(#10\)|permission/i.test(msg)) {
    return tr(
      "Meta didn't allow this. Reconnect Facebook in Settings and allow managing ads.",
      "Meta অনুমতি দেয়নি। সেটিংস থেকে Facebook আবার কানেক্ট করে বিজ্ঞাপন পরিচালনার অনুমতি দাও।",
    );
  }
  return tr(`Meta refused: ${msg || "unknown error"}`, `Meta গ্রহণ করেনি: ${msg || "অজানা সমস্যা"}`);
}

function validLink(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// ধাপ ১: নির্দেশনা + ছবি/ভিডিও → AI পরিকল্পনা (খসড়া)। Meta-তে এখনো কিছু তৈরি হয় না।
export async function createDraft(_prev: LaunchState, formData: FormData): Promise<LaunchState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, token, accountId, currency } = ctx;

  const brief = String(formData.get("brief") ?? "").trim();
  const objective = formData.get("objective") === "messages" ? "messages" : "sales";
  const pageId = String(formData.get("page_id") ?? "");
  const pageName = String(formData.get("page_name") ?? "").slice(0, 200);
  const pixelId = String(formData.get("pixel_id") ?? "");
  const link = objective === "sales" ? validLink(String(formData.get("link") ?? "").trim()) : null;
  const defaultBudget = Number(formData.get("default_budget") ?? 0) || 1000;

  if (brief.length < 10) return { ok: false, error: tr("Write a short brief first.", "আগে ছোট করে নির্দেশনা লেখো।") };
  if (brief.length > 4000) return { ok: false, error: tr("The brief is too long.", "নির্দেশনা খুব বড়।") };
  if (!ID_PATTERN.test(pageId)) return { ok: false, error: tr("Pick a Facebook page.", "একটা Facebook পেজ বাছো।") };
  if (objective === "sales" && !ID_PATTERN.test(pixelId)) return { ok: false, error: tr("Pick a pixel.", "একটা Pixel বাছো।") };
  if (objective === "sales" && !link) return { ok: false, error: tr("Enter the website link.", "ওয়েবসাইটের লিংক দাও।") };

  let media: LaunchSpec["media"];
  try {
    const raw = JSON.parse(String(formData.get("media") ?? "[]")) as { path?: unknown; kind?: unknown; name?: unknown }[];
    media = raw.slice(0, MAX_MEDIA).map((m) => ({
      path: String(m.path ?? ""),
      kind: m.kind === "video" ? ("video" as const) : ("image" as const),
      name: String(m.name ?? "media").slice(0, 100),
    }));
  } catch {
    media = [];
  }
  // শুধু নিজের ফোল্ডারের ফাইল
  if (media.length === 0) return { ok: false, error: tr("Upload at least one image or video.", "অন্তত একটা ছবি বা ভিডিও দাও।") };
  if (media.some((m) => !m.path.startsWith(`${user.id}/`) || m.path.includes(".."))) {
    return { ok: false, error: tr("Invalid upload.", "ভুল আপলোড।") };
  }

  let id: string;
  try {
    const plan = await planFromBrief(supabase, user.id, token, { brief, objective, link, currency, defaultBudget }, await getLocale());
    const { unmatched, ...rest } = plan;
    const spec: LaunchSpec & { unmatched?: string[] } = {
      ...rest,
      page_id: pageId,
      page_name: pageName,
      pixel_id: objective === "sales" ? pixelId : null,
      media,
      unmatched,
    };
    const { client } = await currentClient(supabase, user.id);
    const { data, error } = await supabase
      .from("ad_launches")
      .insert({ user_id: user.id, client_id: client?.id ?? null, ad_account_id: accountId, brief, spec })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: tr("Couldn't save the plan.", "পরিকল্পনা সংরক্ষণ করা যায়নি।") };
    id = data.id;
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    console.error("launch plan failed", err instanceof Error ? err.message : err);
    return { ok: false, error: tr("Couldn't make a plan. Please try again.", "পরিকল্পনা তৈরি করা যায়নি। আবার চেষ্টা করো।") };
  }
  redirect(`/launch/${id}`);
}

async function loadRow(ctx: Exclude<Awaited<ReturnType<typeof context>>, { error: string }>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.supabase
    .from("ad_launches")
    .select("id, user_id, ad_account_id, spec, status, meta, updated_at")
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  return (data as (LaunchRow & { updated_at: string }) | null) ?? null;
}

// ধাপ ২: মালিক পরিকল্পনা দেখে বদলায়
export async function saveSpec(_prev: LaunchState, formData: FormData): Promise<LaunchState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase } = ctx;
  const row = await loadRow(ctx, String(formData.get("id") ?? ""));
  if (!row) return { ok: false, error: tr("Launch not found.", "খুঁজে পাওয়া যায়নি।") };
  if (row.status !== "draft" && row.status !== "failed") {
    return { ok: false, error: tr("This is already on Meta; change it in Ads control.", "এটা Meta-তে তৈরি হয়ে গেছে; বিজ্ঞাপন নিয়ন্ত্রণ থেকে বদলাও।") };
  }
  const spec = parseSpecForm(formData, row.spec, tr);
  if ("error" in spec) return { ok: false, error: spec.error };
  // কিছু তৈরি হয়ে থাকলে (ব্যর্থ চেষ্টায়) টার্গেটিং/বাজেট বদল পরের চেষ্টায় কাজে লাগবে না, তাই আগে জানাই
  const started = Boolean(row.meta?.adset_id);
  await supabase.from("ad_launches").update({ spec: spec.spec, updated_at: new Date().toISOString() }).eq("id", row.id);
  revalidatePath(`/launch/${row.id}`);
  return {
    ok: true,
    message: started
      ? tr("Saved. The ad set already exists on Meta, so budget and targeting changes apply only to new drafts.", "সংরক্ষণ হয়েছে। Ad Set আগেই Meta-তে তৈরি, তাই বাজেট/টার্গেটিং বদল শুধু নতুন খসড়ায় কাজ করবে।")
      : tr("Saved.", "সংরক্ষণ হয়েছে।"),
  };
}

function parseSpecForm(formData: FormData, prev: LaunchSpec, tr: (en: string, bn: string) => string): { spec: LaunchSpec } | { error: string } {
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const name = text("name", 120);
  const budget = Number(text("daily_budget", 20).replace(/[^\d.]/g, ""));
  const ageMin = Math.min(65, Math.max(18, Math.round(Number(formData.get("age_min")))));
  const ageMax = Math.min(65, Math.max(18, Math.round(Number(formData.get("age_max")))));
  const gender = formData.get("gender") === "male" ? "male" : formData.get("gender") === "female" ? "female" : "all";
  const primary = text("primary_text", 2000);
  const headline = text("headline", 80);
  const description = text("description", 60);
  const cta = text("cta", 30);
  const link = prev.objective === "sales" ? validLink(text("link", 2000)) : null;

  let locations: LaunchSpec["locations"] = [];
  let interests: LaunchSpec["interests"] = [];
  let includeAud: { id: string; name: string }[] = [];
  let excludeAud: { id: string; name: string }[] = [];
  try {
    locations = (JSON.parse(String(formData.get("locations") ?? "[]")) as LaunchSpec["locations"])
      .filter((l) => typeof l.key === "string" && /^[\w-]{1,30}$/.test(l.key) && ["country", "region", "city"].includes(l.type))
      .slice(0, 25)
      .map((l) => ({ key: l.key, name: String(l.name).slice(0, 120), type: l.type }));
    interests = (JSON.parse(String(formData.get("interests") ?? "[]")) as LaunchSpec["interests"])
      .filter((i) => ID_PATTERN.test(String(i.id)))
      .slice(0, 25)
      .map((i) => ({ id: String(i.id), name: String(i.name).slice(0, 120) }));
    const aud = (k: string) =>
      (JSON.parse(String(formData.get(k) ?? "[]")) as { id: string; name: string }[])
        .filter((a) => ID_PATTERN.test(String(a.id)))
        .slice(0, 20)
        .map((a) => ({ id: String(a.id), name: String(a.name).slice(0, 200) }));
    includeAud = aud("include_audiences");
    excludeAud = aud("exclude_audiences").filter((a) => !includeAud.some((i) => i.id === a.id));
  } catch {
    return { error: tr("Invalid targeting.", "ভুল টার্গেটিং।") };
  }

  if (!name) return { error: tr("Give the campaign a name.", "ক্যাম্পেইনের নাম দাও।") };
  if (!Number.isFinite(budget) || budget <= 0) return { error: tr("Enter a daily budget above 0.", "০-এর বেশি দৈনিক বাজেট দাও।") };
  if (!Number.isFinite(ageMin) || !Number.isFinite(ageMax) || ageMin > ageMax) return { error: tr("Check the age range.", "বয়সের সীমা ঠিক করো।") };
  if (!primary || !headline) return { error: tr("Primary text and headline are needed.", "মূল লেখা আর হেডলাইন লাগবে।") };
  if (prev.objective === "sales" && !link) return { error: tr("Enter a valid website link.", "সঠিক ওয়েবসাইট লিংক দাও।") };
  if (prev.objective === "sales" && !(SALES_CTAS as readonly string[]).includes(cta)) return { error: tr("Pick a button.", "একটা বাটন বাছো।") };

  return {
    spec: {
      ...prev,
      name,
      daily_budget: budget,
      age_min: ageMin,
      age_max: ageMax,
      gender,
      locations: locations.length ? locations : [{ key: "BD", name: "Bangladesh", type: "country" }],
      interests,
      include_audiences: includeAud,
      exclude_audiences: excludeAud,
      primary_text: primary,
      headline,
      description,
      cta: prev.objective === "messages" ? "MESSAGE_PAGE" : cta,
      link,
      rules: text("rules", 500),
    },
  };
}

// ধাপ ৩: অনুমোদন → Meta-তে বন্ধ (PAUSED) অবস্থায় তৈরি। টাকা খরচ হয় না।
export async function launchOnMeta(_prev: LaunchState, formData: FormData): Promise<LaunchState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, token, accountId, currency } = ctx;
  const row = await loadRow(ctx, String(formData.get("id") ?? ""));
  if (!row) return { ok: false, error: tr("Launch not found.", "খুঁজে পাওয়া যায়নি।") };
  if (row.ad_account_id !== accountId) {
    return { ok: false, error: tr("Switch to this launch's ad account first.", "আগে এই বিজ্ঞাপনের Ad Account বেছে নাও।") };
  }
  // সার্ভার মাঝপথে থেমে গেলে "creating" আটকে থাকে; কিছুক্ষণ পর আবার চালানো যায়
  const stale = row.status === "creating" && Date.now() - new Date(row.updated_at).getTime() > 6 * 60 * 1000;
  if (!["draft", "failed", "waiting_video"].includes(row.status) && !stale) {
    return { ok: false, error: row.status === "creating" ? tr("Already in progress.", "কাজ চলছে।") : tr("Already created.", "আগেই তৈরি হয়েছে।") };
  }

  // একসাথে দুবার চাপলে দুটো ক্যাম্পেইন যেন না হয়: অবস্থা বদলাতে পারলেই কেবল চালাই
  const { data: claimed } = await supabase
    .from("ad_launches")
    .update({ status: "creating", error: null, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id");
  if (!claimed?.length) return { ok: false, error: tr("Already in progress.", "কাজ চলছে।") };

  const result = await runLaunch(supabase, row, token, currency, (err) => metaError(err, tr));
  await clearLiveCache(supabase, ctx.user.id, accountId);
  revalidatePath(`/launch/${row.id}`);
  revalidatePath("/launch");
  if (result.status === "failed") return { ok: false, error: result.error };
  if (result.status === "waiting_video") {
    return {
      ok: true,
      message: tr("Meta is still processing the video. Press Finish in a minute or two.", "Meta ভিডিও প্রসেস করছে। এক-দুই মিনিট পর \"শেষ করো\" চাপো।"),
    };
  }
  return { ok: true, message: tr("Created on Meta, turned off. Check it, then turn it on.", "Meta-তে তৈরি হয়েছে, বন্ধ অবস্থায়। দেখে নিয়ে চালু করো।") };
}

// ধাপ ৪: চালু করা (ক্যাম্পেইন, Ad Set, Ad সবগুলো ACTIVE)
export async function activateLaunch(_prev: LaunchState, formData: FormData): Promise<LaunchState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, token, accountId } = ctx;
  const row = await loadRow(ctx, String(formData.get("id") ?? ""));
  if (!row) return { ok: false, error: tr("Launch not found.", "খুঁজে পাওয়া যায়নি।") };
  if (row.ad_account_id !== accountId) return { ok: false, error: tr("Switch to this launch's ad account first.", "আগে এই বিজ্ঞাপনের Ad Account বেছে নাও।") };
  if (row.status !== "paused") return { ok: false, error: tr("Create it on Meta first.", "আগে Meta-তে তৈরি করো।") };

  const meta: LaunchMeta = row.meta ?? {};
  const ads = Object.values(meta.ads ?? {}).flatMap((a) => (a.ad_id ? [a.ad_id] : []));
  const steps: { level: "campaign" | "adset" | "ad"; id: string }[] = [
    ...ads.map((id) => ({ level: "ad" as const, id })),
    ...(meta.adset_id ? [{ level: "adset" as const, id: meta.adset_id }] : []),
    // ক্যাম্পেইন সবার শেষে, যাতে মাঝপথে থামলে খরচ শুরু না হয়
    ...(meta.campaign_id ? [{ level: "campaign" as const, id: meta.campaign_id }] : []),
  ];
  try {
    for (const s of steps) await setDeliveryStatus(token, s.id, "ACTIVE");
  } catch (err) {
    const error = metaError(err, tr);
    await supabase.from("ad_change_log").insert({
      user_id: user.id, ad_account_id: accountId, level: "campaign", object_id: meta.campaign_id ?? "-", object_name: row.spec.name,
      action: "status", old_value: "PAUSED", new_value: "ACTIVE", ok: false, error: error.slice(0, 500),
    });
    return { ok: false, error };
  }
  await supabase.from("ad_change_log").insert({
    user_id: user.id, ad_account_id: accountId, level: "campaign", object_id: meta.campaign_id ?? "-", object_name: row.spec.name,
    action: "status", old_value: "PAUSED", new_value: "ACTIVE",
  });
  await supabase.from("ad_launches").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", row.id);
  await clearLiveCache(supabase, user.id, accountId);
  revalidatePath(`/launch/${row.id}`);
  revalidatePath("/manage");
  return { ok: true, message: tr("Turned on. Meta will review the ad before it starts showing.", "চালু হয়েছে। দেখানোর আগে Meta বিজ্ঞাপনটা রিভিউ করবে।") };
}

export async function deleteDraft(formData: FormData) {
  const ctx = await context();
  if ("error" in ctx) return;
  const row = await loadRow(ctx, String(formData.get("id") ?? ""));
  // Meta-তে কিছু তৈরি হয়নি এমন খসড়াই কেবল মোছা যায়
  if (!row || row.status !== "draft" || row.meta?.campaign_id) return;
  const paths = row.spec.media.map((m) => m.path);
  if (paths.length) await ctx.supabase.storage.from("ad-media").remove(paths);
  await ctx.supabase.from("ad_launches").delete().eq("id", row.id);
  revalidatePath("/launch");
  redirect("/launch");
}

// রিভিউ ফর্মে লোকেশন/আগ্রহ খোঁজা
export async function searchTargeting(kind: "location" | "interest", q: string) {
  const ctx = await context();
  if ("error" in ctx) return [];
  const query = q.trim().slice(0, 60);
  if (query.length < 2) return [];
  try {
    if (kind === "location") return await searchLocations(ctx.token, query);
    return (await searchInterests(ctx.token, query)).map((i) => ({ key: i.id, name: i.name, type: "interest" as const, size: i.size }));
  } catch {
    return [];
  }
}
