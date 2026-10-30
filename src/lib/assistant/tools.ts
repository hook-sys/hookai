import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCampaignRange } from "@/lib/meta/rangeInsights";
import { getObject, loadAccountStructure, minorFactor, setDailyBudget, setDeliveryStatus } from "@/lib/meta/manage";
import { PRESETS, activeAdVideos, audienceAccount, createLookalike, createPreset, listAudiences, presetName, type PresetId } from "@/lib/meta/audiences";
import { accountPixels, pagesWithInstagram } from "@/lib/meta/assets";
import { getAccountInfo } from "@/lib/rules/engine";
import { CAMPAIGN_ONLY_METRICS, RULE_ACTIONS, RULE_METRICS, RULE_WINDOWS } from "@/lib/rules/types";
import { pickPurchases } from "@/lib/metrics";
import { addDays, todayIn } from "@/lib/dates";
import {
  VIDEO_EVENTS,
  WEB_EVENTS,
  adsWithLinks,
  audienceName,
  cleanUrl,
  createVideoAudience,
  createWebAudience,
  productLabel,
  type VideoKind,
  type WebKind,
} from "@/lib/meta/productAudiences";
import { campaignAds } from "@/lib/meta/launchSources";
import { findInterest, findLocation, listPixels, listPromotePages } from "@/lib/meta/launch";
import { buildQuickSpec, writeAdCopy, type QuickInput } from "@/lib/launchQuick";
import { loadClientProfile } from "@/lib/clientProfile";
import { ruleTemplates } from "@/lib/rules/types";

// AI সহকারীর হাতিয়ার। "পড়ার" হাতিয়ার সাথে সাথে চলে; "কাজ" (Meta-তে কিছু বদলানো) শুধু প্রস্তাব হয়,
// মালিক অনুমোদন দিলে তবেই execute হয়। সব অ্যাকাউন্ট আইডি বর্তমান ক্লায়েন্টের তালিকায় থাকতে হয়।

export type AssistantCtx = {
  supabase: SupabaseClient;
  userId: string;
  clientId: string | null;
  token: string;
  selectedAccount: string;
  accounts: { id: string; name: string }[]; // এই ক্লায়েন্টের অ্যাকাউন্ট
};

type Args = Record<string, unknown>;
const ID = /^\d{5,25}$/;
const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export class ToolError extends Error {}

const lvl = (v: unknown) => (v === "ad" || v === "adset" ? v : "campaign");

function account(ctx: AssistantCtx, a: Args) {
  const id = str(a.account_id) || ctx.selectedAccount;
  const acc = id.startsWith("act_") ? id : `act_${id}`;
  if (!ctx.accounts.some((x) => x.id === acc)) throw new ToolError(`account ${acc} is not one of this client's ad accounts`);
  return acc;
}

const RANGES = { today: 1, yesterday: 1, last_3d: 3, last_7d: 7, last_14d: 14, last_30d: 30 } as const;

// ---------- পড়ার হাতিয়ার ----------

export const READ_TOOLS: Record<string, { desc: string; run: (ctx: AssistantCtx, a: Args) => Promise<unknown> }> = {
  account_summary: {
    desc: 'Spend and results per campaign. args: {account_id?, range: "today"|"yesterday"|"last_3d"|"last_7d"|"last_14d"|"last_30d"}',
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      const info = await getAccountInfo(ctx.token, acc);
      const today = todayIn(info.timezone);
      const r = (str(a.range) in RANGES ? str(a.range) : "last_7d") as keyof typeof RANGES;
      const until = r === "yesterday" ? addDays(today, -1) : today;
      const since = addDays(until, -(RANGES[r] - 1));
      const [rows, structure] = await Promise.all([
        fetchCampaignRange(ctx.token, acc, since, until),
        loadAccountStructure(ctx.token, acc, info.currency).catch(() => []),
      ]);
      const status = new Map(structure.map((c) => [c.id, c]));
      const campaigns = rows
        .map((row) => {
          const spend = Number(row.spend) || 0;
          const results = Number(row.results?.[0]?.values?.[0]?.value) || 0;
          const c = status.get(row.campaign_id ?? "");
          return {
            id: row.campaign_id,
            name: row.campaign_name,
            status: c?.effective_status ?? null,
            daily_budget: c?.daily_budget ?? null,
            spend: round(spend),
            result_type: row.results?.[0]?.indicator ?? null,
            results,
            cost_per_result: results > 0 ? round(spend / results) : null,
            pixel_purchases: pickPurchases(row.actions),
            link_clicks: Number(row.inline_link_clicks) || 0,
            impressions: Number(row.impressions) || 0,
          };
        })
        .filter((c) => c.spend > 0 || c.impressions > 0)
        .sort((x, y) => y.spend - x.spend)
        .slice(0, 25);
      return {
        account: info.name,
        currency: info.currency,
        account_status: info.status,
        range: { since, until },
        total_spend: round(campaigns.reduce((s, c) => s + c.spend, 0)),
        campaigns,
      };
    },
  },
  list_structure: {
    desc: "All campaigns, ad sets and ads with on/off status and daily budgets (IDs needed for changes). args: {account_id?}",
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      const info = await getAccountInfo(ctx.token, acc);
      const s = await loadAccountStructure(ctx.token, acc, info.currency);
      return {
        currency: info.currency,
        campaigns: s.slice(0, 40).map((c) => ({
          id: c.id, name: c.name, status: c.status, effective: c.effective_status, daily_budget: c.daily_budget,
          adsets: c.adsets.slice(0, 15).map((x) => ({
            id: x.id, name: x.name, status: x.status, effective: x.effective_status, daily_budget: x.daily_budget,
            ads: x.ads.slice(0, 10).map((d) => ({ id: d.id, name: d.name, status: d.status, effective: d.effective_status })),
          })),
        })),
      };
    },
  },
  orders_summary: {
    desc: "Store orders by campaign from Hook (confirmed, in courier, delivered, cancelled, returned, delivery rate). args: {days?: 1-60}",
    run: async (ctx, a) => {
      const days = Math.min(60, Math.max(1, Math.round(num(a.days) || 7)));
      const since = addDays(new Date().toISOString().slice(0, 10), -(days - 1));
      const rows: { campaign_id: string | null; campaign_name: string | null; status: string; amount: number }[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        let q = ctx.supabase.from("orders").select("campaign_id, campaign_name, status, amount").eq("user_id", ctx.userId).gte("order_date", since).range(from, from + 999);
        if (ctx.clientId) q = q.eq("client_id", ctx.clientId);
        const { data } = await q;
        rows.push(...((data ?? []) as typeof rows));
        if (!data || data.length < 1000) break;
      }
      const by = new Map<string, { campaign: string; total: number; confirmed: number; shipped: number; delivered: number; cancelled: number; returned: number; pending: number; amount: number }>();
      for (const o of rows) {
        const key = o.campaign_id ?? "none";
        const e = by.get(key) ?? { campaign: o.campaign_name ?? (o.campaign_id ? o.campaign_id : "no campaign"), total: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0, pending: 0, amount: 0 };
        e.total++;
        e.amount += Number(o.amount) || 0;
        if (o.status in e) (e as unknown as Record<string, number>)[o.status]++;
        by.set(key, e);
      }
      const list = [...by.entries()].map(([id, e]) => {
        const done = e.delivered + e.cancelled + e.returned;
        return { campaign_id: id, ...e, amount: Math.round(e.amount), delivery_rate_pct: done ? Math.round((e.delivered / done) * 100) : null };
      });
      return { since, total_orders: rows.length, by_campaign: list.sort((x, y) => y.total - x.total).slice(0, 30) };
    },
  },
  list_audiences: {
    desc: "Custom and lookalike audiences in the account with sizes. args: {account_id?}",
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      const list = await listAudiences(ctx.token, acc);
      return list.slice(0, 60).map((x) => ({ id: x.id, name: x.name, type: x.subtype, size: x.sizeLow, ready: x.ready }));
    },
  },
  assets_check: {
    desc: "Pixels (last event, 7-day events, used by active ad sets), Facebook pages and Instagram links, active ad video count. args: {account_id?}",
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      const [pixels, pages, videos] = await Promise.all([
        accountPixels(ctx.token, acc),
        pagesWithInstagram(ctx.token, acc).catch(() => []),
        activeAdVideos(ctx.token, acc).catch(() => []),
      ]);
      return { pixels, pages, active_ad_videos: videos.length };
    },
  },
  find_product_ads: {
    desc: "Ads in the account with their link and video count; 'matched' = the ad goes to this product/website link. args: {account_id?, url}",
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      if (!cleanUrl(str(a.url))) throw new ToolError("url required");
      const ads = await adsWithLinks(ctx.token, acc, str(a.url));
      return { label: productLabel(str(a.url)), ads: ads.slice(0, 40).map((x) => ({ id: x.id, name: x.name, status: x.status, link: x.link, videos: x.videos.length, matched: x.matched })) };
    },
  },
  campaign_ads: {
    desc: "Ads inside one campaign with their text, link and whether they have a post/video/image to reuse. args: {account_id?, campaign_id}",
    run: async (ctx, a) => {
      const acc = account(ctx, a);
      if (!ID.test(str(a.campaign_id))) throw new ToolError("campaign_id required (use list_structure)");
      const ads = await campaignAds(ctx.token, acc, str(a.campaign_id));
      return ads.map((x) => ({ id: x.id, name: x.name, status: x.status, post: !!x.post_id, video: !!x.video_id, image: !!x.image_hash, text: x.body?.slice(0, 160), headline: x.title, link: x.link }));
    },
  },
  list_rules: {
    desc: "Automatic rules and their latest actions. args: {}",
    run: async (ctx) => {
      const [{ data: rules }, { data: events }] = await Promise.all([
        ctx.supabase.from("ad_rules").select("id, name, enabled, ad_account_id, level, metric, time_window, operator, threshold, action, action_value").eq("user_id", ctx.userId),
        ctx.supabase.from("rule_events").select("rule_name, object_name, action, detail, ok, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(15),
      ]);
      return { rules, recent: events };
    },
  },
};

// ---------- কাজ (অনুমোদনের পর) ----------

export const ACTIONS: Record<string, { desc: string; check: (ctx: AssistantCtx, a: Args) => Promise<Args>; run: (ctx: AssistantCtx, a: Args) => Promise<string> }> = {
  create_audience: {
    desc: `Make a ready-made audience. args: {account_id?, preset_id: one of ${PRESETS.map((p) => p.id).join("|")}, pixel_id? (pixel presets), page_id? (page presets)}. Video presets use the account's active ad videos.`,
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const preset = PRESETS.find((p) => p.id === str(a.preset_id));
      if (!preset) throw new ToolError("unknown preset_id");
      if (preset.needs === "pixel" && !ID.test(str(a.pixel_id))) throw new ToolError("pixel_id required (use assets_check)");
      if (preset.needs === "page" && !ID.test(str(a.page_id))) throw new ToolError("page_id required (use assets_check)");
      return { account_id: acc, preset_id: preset.id, pixel_id: str(a.pixel_id) || null, page_id: str(a.page_id) || null };
    },
    run: async (ctx, a) => {
      const preset = PRESETS.find((p) => p.id === (a.preset_id as PresetId))!;
      const acc = str(a.account_id);
      const label =
        preset.needs === "pixel"
          ? (await accountPixels(ctx.token, acc)).find((p) => p.id === a.pixel_id)?.name ?? str(a.pixel_id)
          : preset.needs === "page"
            ? (await pagesWithInstagram(ctx.token, acc)).find((p) => p.id === a.page_id)?.name ?? str(a.page_id)
            : "active ad videos";
      const existing = (await listAudiences(ctx.token, acc)).find((x) => x.name === presetName(preset, label));
      if (existing) return `Already exists: ${existing.name} (${existing.id})`;
      const videos = preset.needs === "videos" ? await activeAdVideos(ctx.token, acc) : [];
      if (preset.needs === "videos" && videos.length === 0) throw new ToolError("no active video ads in this account");
      const r = await createPreset(ctx.token, acc, preset, { pixelId: str(a.pixel_id), pageId: str(a.page_id), videoIds: videos, label });
      return `Created audience ${presetName(preset, label)} (${r?.id ?? "?"})`;
    },
  },
  create_product_audiences: {
    desc: `Audiences for one product or the whole website from a link. args: {account_id?, url, video?: (${Object.keys(VIDEO_EVENTS).join("|")})[], video_days?: 1-365, ad_ids?: string[] (default: ads matched to the url, see find_product_ads), web?: (${Object.keys(WEB_EVENTS).join("|")})[], web_days?: 1-180, pixel_id? (needed for web), label?}`,
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const url = str(a.url);
      if (!cleanUrl(url)) throw new ToolError("url required");
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      const video = list(a.video).filter((k): k is VideoKind => k in VIDEO_EVENTS);
      const web = list(a.web).filter((k): k is WebKind => k in WEB_EVENTS);
      if (video.length + web.length === 0) throw new ToolError("choose at least one video or web audience");
      let adIds = list(a.ad_ids).filter((x) => ID.test(x));
      if (video.length) {
        const ads = await adsWithLinks(ctx.token, acc, url);
        adIds = adIds.length ? adIds.filter((x) => ads.some((ad) => ad.id === x)) : ads.filter((ad) => ad.matched && ad.videos.length).map((ad) => ad.id);
        if (adIds.length === 0) throw new ToolError("no video ads found for this link; ask the owner which ads (by name) to use");
      }
      if (web.length && !ID.test(str(a.pixel_id))) throw new ToolError("pixel_id required for web audiences (use assets_check)");
      return {
        account_id: acc,
        url,
        label: str(a.label).slice(0, 60) || productLabel(url),
        video,
        video_days: Math.min(365, Math.max(1, Math.round(num(a.video_days) || 30))),
        ad_ids: adIds,
        web,
        web_days: Math.min(180, Math.max(1, Math.round(num(a.web_days) || 30))),
        pixel_id: web.length ? str(a.pixel_id) : null,
      };
    },
    run: async (ctx, a) => {
      const acc = str(a.account_id);
      const url = str(a.url);
      const label = str(a.label);
      const adIds = new Set(a.ad_ids as string[]);
      const videos = adIds.size ? [...new Set((await adsWithLinks(ctx.token, acc, url)).filter((x) => adIds.has(x.id)).flatMap((x) => x.videos))] : [];
      const existing = new Set((await listAudiences(ctx.token, acc)).map((x) => x.name));
      const out: string[] = [];
      const make = async (name: string, fn: () => Promise<unknown>) => {
        if (existing.has(name)) return out.push(`${name}: already exists`);
        try {
          await fn();
          out.push(`${name}: created`);
        } catch (err) {
          out.push(`${name}: failed (${err instanceof Error ? err.message.slice(0, 160) : "error"})`);
        }
      };
      for (const k of a.video as VideoKind[]) {
        const name = audienceName(label, `Video ${VIDEO_EVENTS[k].label[0]}`, num(a.video_days));
        await make(name, () => createVideoAudience(ctx.token, acc, name, k, videos, num(a.video_days)));
      }
      for (const k of a.web as WebKind[]) {
        const name = audienceName(label, `Web ${WEB_EVENTS[k].label[0]}`, num(a.web_days));
        await make(name, () => createWebAudience(ctx.token, acc, name, k, str(a.pixel_id), url, num(a.web_days)));
      }
      return out.join("\n");
    },
  },
  create_launch_draft: {
    desc: `Prepare a NEW AD draft in Hook (nothing goes to Meta; the owner reviews the draft page and approves there). args: {account_id?, content: {drive_links: string[]} | {campaign_id, ad_ids?: string[] (default: active ads), reuse: "post"|"media"}, objective?: "sales"|"messages", daily_budget, age_min?, age_max?, gender?: "all"|"male"|"female", locations?: string[] (place names, e.g. "Dhaka"), interests?: string[] (names), audience?: "broad"|"new"|"retarget", include_audience_ids?: string[] (for retarget, from list_audiences), link?, primary_text?, headline?, description?, cta?, rules?: (${ruleTemplates(1).map((t) => t.id).join("|")})[], rule_target?: number (target cost per result), name?}. Missing settings come from the client profile. Missing text: reused from the old ad, or written by AI.`,
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const content = (a.content ?? {}) as Record<string, unknown>;
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      const drive = list(content.drive_links);
      const campaignId = str(content.campaign_id);
      if (!drive.length && !ID.test(campaignId)) throw new ToolError("content needs drive_links or campaign_id");
      let adIds = list(content.ad_ids).filter((x) => ID.test(x));
      if (!drive.length && adIds.length === 0) {
        const ads = await campaignAds(ctx.token, acc, campaignId);
        adIds = ads.filter((x) => x.status === "ACTIVE").map((x) => x.id).slice(0, 5);
        if (adIds.length === 0) adIds = ads.map((x) => x.id).slice(0, 5);
      }
      const budget = num(a.daily_budget);
      if (!(budget > 0)) throw new ToolError("daily_budget required");
      // জায়গা আর আগ্রহের নাম Meta-র key-তে
      const locations = [];
      for (const q of list(a.locations).slice(0, 10)) {
        const hit = await findLocation(ctx.token, q).catch(() => null);
        if (!hit) throw new ToolError(`location not found on Meta: ${q}`);
        locations.push(hit);
      }
      const interests = [];
      for (const q of list(a.interests).slice(0, 6)) {
        const hit = await findInterest(ctx.token, q).catch(() => null);
        if (hit) interests.push({ id: hit.id, name: hit.name });
      }
      return {
        account_id: acc,
        content: drive.length ? { drive_links: drive.slice(0, 5) } : { campaign_id: campaignId, ad_ids: adIds, reuse: content.reuse === "media" ? "media" : "post" },
        objective: a.objective === "messages" ? "messages" : a.objective === "sales" ? "sales" : null,
        daily_budget: budget,
        age_min: a.age_min === undefined ? null : num(a.age_min),
        age_max: a.age_max === undefined ? null : num(a.age_max),
        gender: a.gender === "male" || a.gender === "female" || a.gender === "all" ? a.gender : null,
        locations,
        interests,
        audience: a.audience === "new" || a.audience === "retarget" ? a.audience : a.audience === "broad" ? "broad" : null,
        include_audience_ids: list(a.include_audience_ids).filter((x) => ID.test(x)),
        link: str(a.link) || null,
        primary_text: str(a.primary_text).slice(0, 2000),
        headline: str(a.headline).slice(0, 80),
        description: str(a.description).slice(0, 60),
        cta: str(a.cta),
        rules: list(a.rules),
        rule_target: a.rule_target === undefined ? null : num(a.rule_target),
        name: str(a.name).slice(0, 120),
      };
    },
    run: async (ctx, a) => {
      const acc = str(a.account_id);
      const profile = ctx.clientId ? (await loadClientProfile(ctx.supabase, ctx.userId, ctx.clientId)) : null;
      const pf = profile?.profile ?? {};
      const objective = (a.objective as "sales" | "messages" | null) ?? pf.objective ?? "sales";
      // পেজ আর Pixel: প্রোফাইল থেকে, না থাকলে অ্যাকাউন্টের প্রথমটা
      const pages = await listPromotePages(ctx.token, acc).catch(() => []);
      const page = pages.find((x) => x.id === pf.page_id) ?? pages[0];
      if (!page) throw new ToolError("no Facebook page available for this ad account");
      const pixels = objective === "sales" ? await listPixels(ctx.token, acc).catch(() => []) : [];
      const pixel = pixels.find((x) => x.id === pf.pixel_id) ?? pixels.find((x) => x.last_fired_time) ?? pixels[0];
      const content = a.content as { drive_links?: string[]; campaign_id?: string; ad_ids?: string[]; reuse?: "post" | "media" };
      const usesPost = !content.drive_links && content.reuse === "post";
      let copy = { primary_text: str(a.primary_text), headline: str(a.headline), description: str(a.description), cta: str(a.cta) };
      // লেখা না থাকলে আর আগের লেখাও না নিলে (Drive থেকে), AI দিয়ে লেখা
      if (!usesPost && content.drive_links && (!copy.primary_text || !copy.headline)) {
        const w = await writeAdCopy(ctx.supabase, { profile: pf, link: str(a.link) || profile?.website_url, objective });
        copy = { ...copy, primary_text: copy.primary_text || w.primary_text, headline: copy.headline || w.headline, description: copy.description || w.description };
      }
      const input: QuickInput = {
        name: str(a.name),
        objective,
        page_id: page.id,
        page_name: page.name,
        pixel_id: pixel?.id ?? null,
        link: str(a.link) || profile?.website_url || null,
        daily_budget: num(a.daily_budget),
        age_min: (a.age_min as number | null) ?? pf.age_min ?? 18,
        age_max: (a.age_max as number | null) ?? pf.age_max ?? 55,
        gender: (a.gender as "all" | "male" | "female" | null) ?? pf.gender ?? "all",
        locations: (a.locations as QuickInput["locations"]).length ? (a.locations as QuickInput["locations"]) : (pf.locations ?? []),
        interests: (a.interests as QuickInput["interests"]).length ? (a.interests as QuickInput["interests"]) : (pf.interests ?? []),
        audience: (a.audience as QuickInput["audience"] | null) ?? (pf.exclude_buyers ? "new" : "broad"),
        include_audiences: (a.include_audience_ids as string[]).map((id) => ({ id, name: id })),
        content: content.drive_links
          ? { source: "drive", links: content.drive_links }
          : { source: "campaign", campaign_id: str(content.campaign_id), ad_ids: content.ad_ids ?? [], mode: content.reuse === "media" ? "media" : "post" },
        copy,
        rule_templates: a.rules as string[],
        rule_target: (a.rule_target as number | null) ?? profile?.target_cost_per_order ?? null,
      };
      const spec = await buildQuickSpec(ctx.token, acc, input);
      const { data, error } = await ctx.supabase
        .from("ad_launches")
        .insert({ user_id: ctx.userId, client_id: ctx.clientId, ad_account_id: acc, brief: "AI assistant", spec })
        .select("id")
        .single();
      if (error || !data) throw new ToolError("could not save the draft");
      return `Draft ready: /launch/${data.id} . Open it, check, then approve to create it on Meta.`;
    },
  },
  create_lookalike: {
    desc: "Lookalike in Bangladesh from an audience (needs 100+ people). args: {account_id?, audience_id, percent: 1-10}",
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      if (!ID.test(str(a.audience_id))) throw new ToolError("audience_id required (use list_audiences)");
      return { account_id: acc, audience_id: str(a.audience_id), percent: Math.min(10, Math.max(1, Math.round(num(a.percent) || 1))) };
    },
    run: async (ctx, a) => {
      const src = await audienceAccount(ctx.token, str(a.audience_id));
      if (src.account_id && `act_${src.account_id}` !== a.account_id) throw new ToolError("audience belongs to another account");
      const r = await createLookalike(ctx.token, str(a.account_id), { id: src.id, name: src.name }, num(a.percent));
      return `Created lookalike ${a.percent}% from ${src.name} (${r.id})`;
    },
  },
  set_status: {
    desc: 'Turn a campaign, ad set or ad on or off. args: {account_id?, level: "campaign"|"adset"|"ad", id, status: "ACTIVE"|"PAUSED"}',
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const status = str(a.status).toUpperCase();
      if (!ID.test(str(a.id)) || (status !== "ACTIVE" && status !== "PAUSED")) throw new ToolError("id and status required");
      const obj = await getObject(ctx.token, str(a.id));
      if (obj.account_id && `act_${obj.account_id}` !== acc) throw new ToolError("this object belongs to another ad account");
      return { account_id: acc, level: lvl(a.level), id: str(a.id), name: obj.name, from: obj.status, status };
    },
    run: async (ctx, a) => {
      await setDeliveryStatus(ctx.token, str(a.id), a.status as "ACTIVE" | "PAUSED");
      await ctx.supabase.from("ad_change_log").insert({
        user_id: ctx.userId, ad_account_id: a.account_id, level: a.level, object_id: a.id, object_name: a.name,
        action: "status", old_value: a.from, new_value: a.status, source: "assistant",
      });
      return `${a.name}: ${a.from} → ${a.status}`;
    },
  },
  set_daily_budget: {
    desc: 'Change the daily budget of a campaign or ad set (account currency, at most double in one step). args: {account_id?, level: "campaign"|"adset", id, amount}',
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const amount = num(a.amount);
      if (!ID.test(str(a.id)) || !Number.isFinite(amount) || amount <= 0) throw new ToolError("id and amount required");
      const [obj, info] = await Promise.all([getObject(ctx.token, str(a.id)), getAccountInfo(ctx.token, acc)]);
      if (obj.account_id && `act_${obj.account_id}` !== acc) throw new ToolError("this object belongs to another ad account");
      if (!obj.daily_budget) throw new ToolError("this item has no daily budget at its level");
      const old = Number(obj.daily_budget) / minorFactor(info.currency);
      if (amount > old * 2) throw new ToolError(`for safety a budget can at most double in one step (max ${round(old * 2)})`);
      return { account_id: acc, level: lvl(a.level) === "ad" ? "adset" : lvl(a.level), id: str(a.id), name: obj.name, from: round(old), amount: round(amount), currency: info.currency };
    },
    run: async (ctx, a) => {
      const info = await getAccountInfo(ctx.token, str(a.account_id));
      await setDailyBudget(ctx.token, str(a.id), num(a.amount) * minorFactor(info.currency));
      await ctx.supabase.from("ad_change_log").insert({
        user_id: ctx.userId, ad_account_id: a.account_id, level: a.level, object_id: a.id, object_name: a.name,
        action: "daily_budget", old_value: String(a.from), new_value: String(a.amount), source: "assistant",
      });
      return `${a.name}: ${a.from} → ${a.amount} ${a.currency}`;
    },
  },
  create_rule: {
    desc: `Create an hourly automatic rule. args: {account_id?, name, level: "campaign"|"adset", metric: ${RULE_METRICS.join("|")}, time_window: ${RULE_WINDOWS.join("|")}, operator: "gt"|"lt", threshold, min_spend?, min_results?, action: ${RULE_ACTIONS.join("|")}, action_value? (1-50 % for budget), max_budget? (required to raise budget), cooldown_hours? (default 24)}`,
    check: async (ctx, a) => {
      const acc = account(ctx, a);
      const metric = str(a.metric), win = str(a.time_window), action = str(a.action);
      const level = a.level === "campaign" ? "campaign" : "adset";
      if (!(RULE_METRICS as readonly string[]).includes(metric) || !(RULE_WINDOWS as readonly string[]).includes(win) || !(RULE_ACTIONS as readonly string[]).includes(action)) throw new ToolError("invalid rule fields");
      if (level === "adset" && CAMPAIGN_ONLY_METRICS.has(metric as never)) throw new ToolError("order metrics work at campaign level only");
      const threshold = num(a.threshold);
      if (!Number.isFinite(threshold) || threshold < 0) throw new ToolError("threshold required");
      const actionValue = a.action_value === undefined ? null : num(a.action_value);
      if ((action === "increase_budget" || action === "decrease_budget") && (!actionValue || actionValue > 50)) throw new ToolError("action_value 1-50 required");
      const maxBudget = a.max_budget === undefined ? null : num(a.max_budget);
      if (action === "increase_budget" && !maxBudget) throw new ToolError("max_budget required to raise budgets");
      return {
        account_id: acc, name: str(a.name).slice(0, 120) || "Rule", level, metric, time_window: win, operator: a.operator === "lt" ? "lt" : "gt", threshold,
        min_spend: Math.max(0, num(a.min_spend) || 0), min_results: Math.max(0, num(a.min_results) || 0), action, action_value: actionValue,
        max_budget: maxBudget, cooldown_hours: Math.min(168, Math.max(1, Math.round(num(a.cooldown_hours) || 24))),
      };
    },
    run: async (ctx, a) => {
      const { account_id, ...rest } = a;
      const { error } = await ctx.supabase.from("ad_rules").insert({ ...rest, user_id: ctx.userId, client_id: ctx.clientId, ad_account_id: account_id });
      if (error) throw new ToolError(`could not save rule: ${error.message}`);
      return `Rule "${a.name}" saved; it runs every hour.`;
    },
  },
};
