import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdAccount, getAdAccounts, graphGetAll, graphRequest } from "@/lib/meta/graph";
import { createAd, listPixels, listPromotePages, pageInstagram, SALES_CTAS, searchLocations, startVideoUpload, uploadImage, videoState } from "@/lib/meta/launch";
import { loadAccountStructure, minorFactor } from "@/lib/meta/manage";
import { activeAdVideos } from "@/lib/meta/audiences";
import { driveDownloadUrl, kindFromName, parseDriveLink } from "@/lib/meta/launchSources";
import * as ads from "./ads";
import { assertPublicUrl, readLimited, safeFetch } from "./safeFetch";

// Claude কানেক্টরের টুল। নিয়ম:
// - নতুন ক্যাম্পেইন/অ্যাডসেট/অ্যাড/কপি সবসময় PAUSED
// - চালু করা আর বাজেট বাড়ানো: আগে preview + confirm_code, তারপর একই কল confirm_code সহ
// - প্রতিটা write কাজের লগ (route.ts-এ)
// - কোনো id-তে কাজের আগে মিলিয়ে দেখা হয় সেটা ওই ক্লায়েন্টের Ad Account-এর কিনা

export class ToolError extends Error {}

type Args = Record<string, unknown>;
type Account = { id: string; name: string | null };
type Profile = {
  ad_account_id?: string;
  page_id?: string;
  page_name?: string;
  pixel_id?: string;
  max_daily_budget?: number;
  age_min?: number;
  age_max?: number;
  gender?: "all" | "male" | "female";
  locations?: ads.GeoPick[];
};
export type ClientRow = { id: string; name: string; website_url: string | null; profile: Profile; accounts: Account[] };

export type Ctx = {
  supabase: SupabaseClient;
  accessHash: string;
  userId: string;
  via: string;
  metaToken: string | null;
  tokenSource: "system_user" | "owner_login" | "none";
  clients: ClientRow[];
};

export type ToolOut = { result: unknown; log?: { client?: string; object_id?: string; summary: string; params?: Record<string, unknown> } };
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  write: boolean;
  run: (ctx: Ctx, a: Args) => Promise<ToolOut>;
};

export const DEFAULTS = { age_min: 25, age_max: 45, locations: "Bangladesh cities only (Dhaka, Chittagong, Gazipur, Narayanganj, Sylhet, Khulna, Rajshahi, Comilla, Mymensingh, Rangpur, Barisal, Bogra)", audience: "broad (no detailed targeting)", placements: "Advantage+ placements" };

// ---------- ছোট সাহায্য ----------

const token = (ctx: Ctx) => {
  if (!ctx.metaToken) throw new ToolError("Meta is not connected. Set META_SYSTEM_USER_TOKEN on the server, or connect Meta in Hook settings.");
  return ctx.metaToken;
};

function str(a: Args, k: string, max = 500): string | undefined {
  const v = a[k];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ToolError(`${k} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new ToolError(`${k} is too long (max ${max} characters).`);
  return t || undefined;
}
const need = (a: Args, k: string, max = 500) => {
  const v = str(a, k, max);
  if (!v) throw new ToolError(`${k} is required.`);
  return v;
};
function num(a: Args, k: string, min: number, max: number): number | undefined {
  const v = a[k];
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ToolError(`${k} must be a number from ${min} to ${max}.`);
  return n;
}
const metaId = (a: Args, k: string, required = true) => {
  const v = str(a, k, 30);
  if (!v) {
    if (required) throw new ToolError(`${k} is required.`);
    return undefined;
  }
  if (!/^\d{5,25}$/.test(v)) throw new ToolError(`${k} must be a Meta id (digits only).`);
  return v;
};
function oneOf<T extends string>(a: Args, k: string, list: readonly T[], fallback?: T): T {
  const v = str(a, k, 40);
  if (!v) {
    if (fallback !== undefined) return fallback;
    throw new ToolError(`${k} is required (${list.join(", ")}).`);
  }
  const hit = list.find((x) => x.toLowerCase() === v.toLowerCase());
  if (!hit) throw new ToolError(`${k} must be one of: ${list.join(", ")}.`);
  return hit;
}
const names = (a: Args, k: string) => {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ToolError(`${k} must be a list of names.`);
  return (v as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 25);
};

function findClient(ctx: Ctx, a: Args): ClientRow {
  const name = need(a, "client", 80).toLowerCase();
  const exact = ctx.clients.find((c) => c.name.toLowerCase() === name);
  if (exact) return exact;
  const partial = ctx.clients.filter((c) => c.name.toLowerCase().includes(name));
  if (partial.length === 1) return partial[0];
  const list = ctx.clients.map((c) => c.name).join(", ") || "none yet";
  throw new ToolError(partial.length ? `"${name}" matches several clients: ${partial.map((c) => c.name).join(", ")}.` : `No client called "${name}". Clients: ${list}.`);
}

function pickAccount(c: ClientRow, a: Args): string {
  const given = str(a, "ad_account_id", 30);
  if (given) {
    const id = given.startsWith("act_") ? given : `act_${given}`;
    if (!c.accounts.some((x) => x.id === id)) throw new ToolError(`${id} is not one of ${c.name}'s ad accounts (${c.accounts.map((x) => x.id).join(", ") || "none"}).`);
    return id;
  }
  if (c.profile.ad_account_id && c.accounts.some((x) => x.id === c.profile.ad_account_id)) return c.profile.ad_account_id;
  if (c.accounts.length === 1) return c.accounts[0].id;
  if (!c.accounts.length) throw new ToolError(`${c.name} has no ad account yet. Use set_client_config with ad_account_id.`);
  throw new ToolError(`${c.name} has several ad accounts; say which: ${c.accounts.map((x) => `${x.id} (${x.name ?? ""})`).join(", ")}. Or set a default with set_client_config.`);
}

async function currencyOf(ctx: Ctx, act: string) {
  const info = await getAdAccount(token(ctx), act);
  return info.currency || "USD";
}

const money = (v: number, cur: string) => `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`;
const fromMinor = (v: unknown, cur: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / minorFactor(cur) : null;
};

function capCheck(c: ClientRow, daily: number, cur: string) {
  const cap = Number(c.profile.max_daily_budget);
  if (cap > 0 && daily > cap) {
    throw new ToolError(`${money(daily, cur)} a day is above ${c.name}'s limit of ${money(cap, cur)}. Change the limit with set_client_config if you really want this.`);
  }
}

type Level = "campaign" | "adset" | "ad";
const LEVELS = ["campaign", "adset", "ad"] as const;
const FIELDS: Record<Level, string> = {
  campaign: "id,name,status,effective_status,account_id,objective,daily_budget,lifetime_budget",
  adset: "id,name,status,effective_status,account_id,daily_budget,lifetime_budget,campaign{id,name,status,objective}",
  ad: "id,name,status,effective_status,account_id,adset{id,name,status,daily_budget,lifetime_budget},campaign{id,name,status,objective,daily_budget,lifetime_budget}",
};
type Obj = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  account_id: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  campaign?: { id: string; name: string; status: string; objective?: string; daily_budget?: string; lifetime_budget?: string };
  adset?: { id: string; name: string; status: string; daily_budget?: string; lifetime_budget?: string };
};

// id-টা এই ক্লায়েন্টের অ্যাকাউন্টের কিনা মিলিয়ে তবেই কাজ
async function owned(ctx: Ctx, c: ClientRow, level: Level, id: string) {
  const o = await graphRequest<Obj>(`/${id}`, { params: { fields: FIELDS[level] }, token: token(ctx) });
  const act = `act_${o.account_id}`;
  if (!c.accounts.some((x) => x.id === act)) throw new ToolError(`This ${level} is in ${act}, which is not one of ${c.name}'s ad accounts.`);
  return { o, act };
}

// ---------- preview + confirm ----------

function confirmKey() {
  const k = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!k) throw new ToolError("Server key is missing.");
  return createHash("sha256").update(`hook-mcp-confirm:${k}`).digest();
}
const sign = (ctx: Ctx, parts: string[], exp: number) =>
  createHmac("sha256", confirmKey()).update([ctx.userId, ...parts, exp].join("|")).digest("base64url").slice(0, 24);

function makeConfirm(ctx: Ctx, parts: string[]) {
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  return `${exp}-${sign(ctx, parts, exp)}`;
}
function confirmOk(ctx: Ctx, code: string | undefined, parts: string[]) {
  const m = /^(\d{10})-([A-Za-z0-9_-]{24})$/.exec(code ?? "");
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < Date.now() / 1000) throw new ToolError("This confirm_code has expired. Ask for a new preview.");
  const want = Buffer.from(sign(ctx, parts, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}
const PREVIEW_NOTE =
  "Nothing has changed yet. Show this summary to the user. Only if they clearly say yes, call the same tool again with the same arguments plus this confirm_code (valid 15 minutes).";

const adsManager = (act: string, level: Level, id: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/${level === "campaign" ? "campaigns" : level === "adset" ? "adsets" : "ads"}?act=${act.replace("act_", "")}&selected_${level === "campaign" ? "campaign" : level === "adset" ? "adset" : "ad"}_ids=${id}`;

// ---------- তৈরি (ভেতরের ধাপ) ----------

async function makeAdSet(ctx: Ctx, c: ClientRow, campaign: { id: string; objective: ads.Objective; act: string; name: string }, a: Args) {
  const t = token(ctx);
  const cur = await currencyOf(ctx, campaign.act);
  const daily = num(a, "daily_budget", 1, 100_000_000);
  if (!daily) throw new ToolError("daily_budget is required (in the ad account's currency).");
  capCheck(c, daily, cur);
  const ageMin = num(a, "age_min", 18, 65) ?? c.profile.age_min ?? DEFAULTS.age_min;
  const ageMax = num(a, "age_max", 18, 65) ?? c.profile.age_max ?? DEFAULTS.age_max;
  if (ageMin > ageMax) throw new ToolError("age_min must be less than age_max.");
  const gender = oneOf(a, "gender", ["all", "male", "female"] as const, c.profile.gender ?? "all");
  const locNames = names(a, "locations");
  const geo = locNames?.length ? await ads.resolveLocations(t, locNames) : c.profile.locations?.length ? c.profile.locations : await ads.urbanBangladesh(t);
  const pixelId = metaId(a, "pixel_id", false) ?? c.profile.pixel_id;
  if (campaign.objective === "sales" && !pixelId) throw new ToolError(`Sales needs a pixel. Set ${c.name}'s pixel with set_client_config (find it with find_assets).`);

  const name = str(a, "adset_name", 200) ?? `${campaign.name} · ${ageMin}-${ageMax}`;
  const id = await ads.createAdSet(t, campaign.act, {
    campaignId: campaign.id,
    name,
    objective: campaign.objective,
    dailyBudgetMinor: daily * minorFactor(cur),
    targeting: ads.buildTargeting(geo, Math.round(ageMin), Math.round(ageMax), gender),
    pixelId,
  });
  return {
    id,
    name,
    summary: {
      daily_budget: money(daily, cur),
      age: `${ageMin}-${ageMax}`,
      gender,
      locations: geo.map((g) => g.name),
      audience: "broad",
      placements: "Advantage+",
      optimization: campaign.objective === "sales" ? `Purchases (pixel ${pixelId})` : "Link clicks",
    },
  };
}

async function makeAd(ctx: Ctx, c: ClientRow, adset: { id: string; act: string; objective: ads.Objective; name: string }, a: Args) {
  const t = token(ctx);
  const pageId = metaId(a, "page_id", false) ?? c.profile.page_id;
  if (!pageId) throw new ToolError(`${c.name} has no Facebook page set. Use set_client_config with page_id (find it with find_assets).`);
  const link = str(a, "link", 1000) ?? c.website_url ?? undefined;
  if (!link || !/^https?:\/\/[^\s]+\.[^\s]+/.test(link)) throw new ToolError("link (website URL) is required.");
  const cta = oneOf(a, "cta", SALES_CTAS, adset.objective === "sales" ? "SHOP_NOW" : "LEARN_MORE");
  const primary = need(a, "primary_text", 2000);
  const headline = need(a, "headline", 255);
  const description = str(a, "description", 255);
  const imageHash = str(a, "image_hash", 64);
  const videoId = metaId(a, "video_id", false);
  if (!!imageHash === !!videoId) throw new ToolError("Give exactly one of image_hash or video_id (from upload_creative).");
  if (imageHash && !/^[a-f0-9]{32}$/i.test(imageHash)) throw new ToolError("image_hash looks wrong.");

  let thumbnail: string | null = null;
  if (videoId) {
    const v = await videoState(t, videoId);
    if (v.status !== "ready" || !v.thumbnail) throw new ToolError(`The video is still ${v.status}. Try again in a minute (check with creative_status).`);
    thumbnail = v.thumbnail;
  }
  const name = str(a, "ad_name", 200) ?? `${adset.name} · Ad`;
  const creativeId = await ads.createCreative(t, adset.act, {
    name,
    pageId,
    instagramId: await pageInstagram(t, pageId),
    link,
    primaryText: primary,
    headline,
    description,
    cta,
    imageHash,
    videoId,
    thumbnail,
  });
  const adId = await createAd(t, adset.act, adset.id, creativeId, name);
  return { ad_id: adId, creative_id: creativeId, name, link, cta };
}

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const pick = (list: { action_type: string; value: string }[] | undefined) => {
  for (const t of PURCHASE_TYPES) {
    const hit = list?.find((x) => x.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
};
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- সব টুল ----------

const S = {
  client: { type: "string", description: "Client (brand) name, e.g. \"Formal Men BD\". See list_clients." },
  ad_account_id: { type: "string", description: "Only if the client has several ad accounts and no default, e.g. act_123." },
  level: { type: "string", enum: [...LEVELS] },
  confirm_code: { type: "string", description: "From the preview. Only send after the user said yes." },
  locations: { type: "array", items: { type: "string" }, description: "City/region names in Bangladesh, \"Bangladesh\" for the whole country, or \"urban\". Default: the client's saved locations, else major cities." },
};

export const TOOLS: Tool[] = [
  {
    name: "list_clients",
    title: "List clients",
    description: "List the user's clients with their ad accounts, Facebook page, pixel, website, budget limit and default targeting. Call this first.",
    inputSchema: { type: "object", properties: {} },
    write: false,
    run: async (ctx) => ({
      result: {
        meta_token: ctx.tokenSource,
        defaults: DEFAULTS,
        rules: "Everything is created PAUSED. Turning on and raising budgets need a preview and the user's yes.",
        clients: ctx.clients.map((c) => {
          const missing = [
            !c.accounts.length && "ad account",
            !c.profile.page_id && "page",
            !c.profile.pixel_id && "pixel (needed for Sales)",
            !c.website_url && "website",
          ].filter(Boolean);
          return {
            name: c.name,
            ad_accounts: c.accounts,
            default_ad_account: c.profile.ad_account_id ?? (c.accounts.length === 1 ? c.accounts[0].id : null),
            page: c.profile.page_id ? { id: c.profile.page_id, name: c.profile.page_name ?? null } : null,
            pixel_id: c.profile.pixel_id ?? null,
            website: c.website_url,
            max_daily_budget: c.profile.max_daily_budget ?? null,
            age: `${c.profile.age_min ?? DEFAULTS.age_min}-${c.profile.age_max ?? DEFAULTS.age_max}`,
            locations: c.profile.locations?.length ? c.profile.locations.map((l) => l.name) : "major cities (default)",
            missing,
          };
        }),
      },
    }),
  },
  {
    name: "find_assets",
    title: "Find ad accounts, pages and pixels",
    description: "Show the ad accounts the Meta connection can use, and for one ad account its Facebook pages and pixels. Use it to fill set_client_config.",
    inputSchema: { type: "object", properties: { client: S.client, ad_account_id: { type: "string", description: "e.g. act_123. Optional." } } },
    write: false,
    run: async (ctx, a) => {
      const t = token(ctx);
      const all = (await getAdAccounts(t)).slice(0, 100).map((x) => ({ id: x.id, name: x.name, currency: x.currency, active: x.account_status === 1 }));
      let act = str(a, "ad_account_id", 30);
      if (act && !act.startsWith("act_")) act = `act_${act}`;
      if (!act && str(a, "client")) act = pickAccount(findClient(ctx, a), a);
      if (act && !/^act_\d{1,20}$/.test(act)) throw new ToolError("ad_account_id looks wrong.");
      const [pages, pixels] = act ? await Promise.all([listPromotePages(t, act).catch(() => []), listPixels(t, act).catch(() => [])]) : [[], []];
      return { result: { ad_accounts: all, ...(act ? { for_account: act, pages, pixels } : {}) } };
    },
  },
  {
    name: "set_client_config",
    title: "Save client settings",
    description:
      "Create a client or update its settings: ad account (added and made default), Facebook page, pixel, website, daily budget limit, default age and locations. Only send what changes.",
    inputSchema: {
      type: "object",
      required: ["client"],
      properties: {
        client: S.client,
        ad_account_id: { type: "string", description: "e.g. act_123; added to this client and made its default" },
        page_id: { type: "string" },
        pixel_id: { type: "string" },
        website_url: { type: "string" },
        max_daily_budget: { type: "number", description: "Safety limit per ad set/campaign per day, in the account currency" },
        age_min: { type: "number" },
        age_max: { type: "number" },
        locations: S.locations,
      },
    },
    write: true,
    run: async (ctx, a) => {
      const t = token(ctx);
      const name = need(a, "client", 80);
      const patch: Profile = {};
      let act = str(a, "ad_account_id", 30);
      let actName: string | null = null;
      if (act) {
        if (!act.startsWith("act_")) act = `act_${act}`;
        if (!/^act_\d{1,20}$/.test(act)) throw new ToolError("ad_account_id looks wrong.");
        actName = (await getAdAccount(t, act)).name;
        patch.ad_account_id = act;
      }
      const pageId = metaId(a, "page_id", false);
      if (pageId) {
        patch.page_id = pageId;
        patch.page_name = await graphRequest<{ name: string }>(`/${pageId}`, { params: { fields: "name" }, token: t }).then((p) => p.name).catch(() => undefined);
      }
      const pixelId = metaId(a, "pixel_id", false);
      if (pixelId) patch.pixel_id = pixelId;
      const cap = num(a, "max_daily_budget", 1, 100_000_000);
      if (cap) patch.max_daily_budget = cap;
      const ageMin = num(a, "age_min", 18, 65);
      const ageMax = num(a, "age_max", 18, 65);
      if (ageMin) patch.age_min = Math.round(ageMin);
      if (ageMax) patch.age_max = Math.round(ageMax);
      const locNames = names(a, "locations");
      if (locNames?.length) patch.locations = await ads.resolveLocations(t, locNames);
      const website = str(a, "website_url", 300);
      if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(website)) throw new ToolError("website_url must start with https://");

      const { error } = await ctx.supabase.rpc("mcp_set_client", {
        p_access_hash: ctx.accessHash,
        p_name: name,
        p_profile_patch: patch,
        p_website: website ?? null,
        p_ad_account_id: act ?? null,
        p_ad_account_name: actName,
      });
      if (error) throw new ToolError(error.message.includes("another client") ? `${act} already belongs to another client.` : "Couldn't save the client.");
      const saved = { ...patch, ...(website ? { website_url: website } : {}), ...(act ? { ad_account_name: actName } : {}) };
      return { result: { saved: true, client: name, changes: saved }, log: { client: name, summary: `Client settings saved: ${Object.keys(saved).join(", ")}`, params: saved } };
    },
  },
  {
    name: "search_locations",
    title: "Find a location",
    description: "Find Bangladesh cities or regions by name (for targeting).",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
    write: false,
    run: async (ctx, a) => ({ result: await searchLocations(token(ctx), need(a, "query", 80), 8) }),
  },
  {
    name: "upload_creative",
    title: "Upload image or video",
    description:
      "Upload an image or video from a link (Google Drive share link set to 'Anyone with the link', Supabase storage, or any public https file) to the client's ad account. Returns image_hash or video_id for create_ad. Videos take a minute or two to process.",
    inputSchema: {
      type: "object",
      required: ["client", "url"],
      properties: {
        client: S.client,
        ad_account_id: S.ad_account_id,
        url: { type: "string" },
        kind: { type: "string", enum: ["image", "video"], description: "Optional; guessed from the file" },
        name: { type: "string" },
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const t = token(ctx);
      const url = need(a, "url", 2000);
      const drive = parseDriveLink(url);
      if (drive?.folder) throw new ToolError("That is a Drive folder. Send the link of one file.");
      const src = drive ? driveDownloadUrl(drive.id) : url;
      const srcUrl = await assertPublicUrl(src);
      let kind = (str(a, "kind", 10) as "image" | "video" | undefined) ?? kindFromName(decodeURIComponent(new URL(url).pathname)) ?? undefined;
      const name = str(a, "name", 100) ?? (decodeURIComponent(srcUrl.pathname.split("/").pop() ?? "") || `${c.name} creative`);

      if (kind !== "video") {
        const res = await safeFetch(srcUrl.toString());
        if (!res.ok) throw new ToolError(`Couldn't download the file (HTTP ${res.status}).`);
        const type = res.headers.get("content-type") ?? "";
        if (type.startsWith("text/html")) {
          await res.body?.cancel();
          throw new ToolError("The link opens a web page, not a file. For Google Drive, share it as 'Anyone with the link'.");
        }
        kind ??= type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : undefined;
        if (kind === "image") {
          const bytes = await readLimited(res, 30 * 1024 * 1024);
          const hash = await uploadImage(t, act, bytes, name);
          return { result: { kind, image_hash: hash, ad_account: act }, log: { client: c.name, object_id: hash, summary: `Image uploaded to ${act}`, params: { url, name } } };
        }
        await res.body?.cancel();
        if (kind !== "video") throw new ToolError("Couldn't tell if this is an image or a video. Send kind.");
      }
      const videoId = await startVideoUpload(t, act, srcUrl.toString(), name);
      return {
        result: { kind: "video", video_id: videoId, status: "processing", next: "Wait a minute, then check creative_status before create_ad.", ad_account: act },
        log: { client: c.name, object_id: videoId, summary: `Video upload started in ${act}`, params: { url, name } },
      };
    },
  },
  {
    name: "creative_status",
    title: "Video processing status",
    description: "Check whether an uploaded video is ready to use in an ad.",
    inputSchema: { type: "object", required: ["video_id"], properties: { video_id: { type: "string" } } },
    write: false,
    run: async (ctx, a) => ({ result: await videoState(token(ctx), metaId(a, "video_id")!) }),
  },
  {
    name: "create_campaign",
    title: "Create campaign (paused)",
    description: "Create a Sales or Traffic campaign. Always PAUSED; budget is set on the ad set.",
    inputSchema: {
      type: "object",
      required: ["client", "name", "objective"],
      properties: { client: S.client, ad_account_id: S.ad_account_id, name: { type: "string" }, objective: { type: "string", enum: ["sales", "traffic"] } },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const name = need(a, "name", 200);
      const objective = oneOf(a, "objective", ["sales", "traffic"] as const);
      const id = await ads.createCampaign(token(ctx), act, name, objective);
      return {
        result: { campaign_id: id, status: "PAUSED", objective, ad_account: act, ads_manager: adsManager(act, "campaign", id) },
        log: { client: c.name, object_id: id, summary: `Campaign "${name}" (${objective}) created PAUSED in ${act}`, params: { name, objective } },
      };
    },
  },
  {
    name: "create_adset",
    title: "Create ad set (paused)",
    description: `Create an ad set in a campaign: broad audience, Advantage+ placements, daily budget. Defaults: age ${DEFAULTS.age_min}-${DEFAULTS.age_max}, ${DEFAULTS.locations}. Always PAUSED.`,
    inputSchema: {
      type: "object",
      required: ["client", "campaign_id", "daily_budget"],
      properties: {
        client: S.client,
        campaign_id: { type: "string" },
        daily_budget: { type: "number", description: "Per day, in the ad account currency (e.g. 500 for 500 BDT)" },
        adset_name: { type: "string" },
        age_min: { type: "number" },
        age_max: { type: "number" },
        gender: { type: "string", enum: ["all", "male", "female"] },
        locations: S.locations,
        pixel_id: { type: "string", description: "Sales only; default is the client's pixel" },
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const { o, act } = await owned(ctx, c, "campaign", metaId(a, "campaign_id")!);
      const objective = ads.objectiveFromMeta(o.objective);
      if (!objective) throw new ToolError(`This campaign's objective is ${o.objective}; only Sales and Traffic campaigns are supported.`);
      const s = await makeAdSet(ctx, c, { id: o.id, objective, act, name: o.name }, a);
      return {
        result: { adset_id: s.id, status: "PAUSED", ...s.summary, ads_manager: adsManager(act, "adset", s.id) },
        log: { client: c.name, object_id: s.id, summary: `Ad set "${s.name}" created PAUSED (${s.summary.daily_budget}/day)`, params: s.summary },
      };
    },
  },
  {
    name: "create_ad",
    title: "Create ad (paused)",
    description: "Create an ad in an ad set from an uploaded image (image_hash) or video (video_id), with primary text, headline, website link and button. Uses the client's page. Always PAUSED.",
    inputSchema: {
      type: "object",
      required: ["client", "adset_id", "primary_text", "headline"],
      properties: {
        client: S.client,
        adset_id: { type: "string" },
        image_hash: { type: "string" },
        video_id: { type: "string" },
        primary_text: { type: "string" },
        headline: { type: "string" },
        description: { type: "string" },
        link: { type: "string", description: "Default: the client's website" },
        cta: { type: "string", enum: [...SALES_CTAS], description: "Default SHOP_NOW (sales) or LEARN_MORE (traffic)" },
        ad_name: { type: "string" },
        page_id: { type: "string", description: "Default: the client's page" },
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const { o, act } = await owned(ctx, c, "adset", metaId(a, "adset_id")!);
      const objective = ads.objectiveFromMeta(o.campaign?.objective);
      if (!objective) throw new ToolError("Only ad sets in Sales or Traffic campaigns are supported.");
      const ad = await makeAd(ctx, c, { id: o.id, act, objective, name: o.name }, a);
      return {
        result: { ...ad, status: "PAUSED", ads_manager: adsManager(act, "ad", ad.ad_id) },
        log: { client: c.name, object_id: ad.ad_id, summary: `Ad "${ad.name}" created PAUSED`, params: { adset_id: o.id, link: ad.link, cta: ad.cta } },
      };
    },
  },
  {
    name: "launch_ad",
    title: "Campaign + ad set + ad in one go (paused)",
    description:
      `Create a whole new ad in one call: campaign, ad set and ad, all PAUSED. Needs image_hash or video_id from upload_creative. Defaults: broad, age ${DEFAULTS.age_min}-${DEFAULTS.age_max}, major Bangladesh cities, Advantage+ placements, client's page, pixel and website.`,
    inputSchema: {
      type: "object",
      required: ["client", "name", "objective", "daily_budget", "primary_text", "headline"],
      properties: {
        client: S.client,
        ad_account_id: S.ad_account_id,
        name: { type: "string", description: "Campaign name" },
        objective: { type: "string", enum: ["sales", "traffic"] },
        daily_budget: { type: "number", description: "Per day, in the ad account currency" },
        image_hash: { type: "string" },
        video_id: { type: "string" },
        primary_text: { type: "string" },
        headline: { type: "string" },
        description: { type: "string" },
        link: { type: "string" },
        cta: { type: "string", enum: [...SALES_CTAS] },
        age_min: { type: "number" },
        age_max: { type: "number" },
        gender: { type: "string", enum: ["all", "male", "female"] },
        locations: S.locations,
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const name = need(a, "name", 200);
      const objective = oneOf(a, "objective", ["sales", "traffic"] as const);
      // সব আগে যাচাই, যাতে অর্ধেক তৈরি হয়ে না থাকে
      if (!!str(a, "image_hash", 64) === !!str(a, "video_id", 30)) throw new ToolError("Give exactly one of image_hash or video_id (from upload_creative).");
      need(a, "primary_text", 2000);
      need(a, "headline", 255);
      if (!c.profile.page_id && !str(a, "page_id")) throw new ToolError(`${c.name} has no Facebook page set. Use set_client_config first.`);
      if (objective === "sales" && !c.profile.pixel_id && !str(a, "pixel_id")) throw new ToolError(`Sales needs ${c.name}'s pixel. Use set_client_config first.`);

      const created: Record<string, string> = {};
      try {
        created.campaign_id = await ads.createCampaign(token(ctx), act, name, objective);
        const s = await makeAdSet(ctx, c, { id: created.campaign_id, objective, act, name }, a);
        created.adset_id = s.id;
        const ad = await makeAd(ctx, c, { id: s.id, act, objective, name }, a);
        created.ad_id = ad.ad_id;
        return {
          result: { ...created, status: "PAUSED (campaign, ad set and ad)", ...s.summary, link: ad.link, cta: ad.cta, ads_manager: adsManager(act, "campaign", created.campaign_id) },
          log: { client: c.name, object_id: created.campaign_id, summary: `Launched "${name}" (${objective}, ${s.summary.daily_budget}/day) — all PAUSED`, params: { ...created, ...s.summary } },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new ToolError(Object.keys(created).length ? `${msg} (Already created, all PAUSED: ${JSON.stringify(created)})` : msg);
      }
    },
  },
  {
    name: "set_status",
    title: "Pause or turn on",
    description:
      "Pause (immediate) or turn on (ACTIVE) a campaign, ad set or ad. Turning on first returns a preview with a confirm_code; show it to the user and only call again with confirm_code after they say yes.",
    inputSchema: {
      type: "object",
      required: ["client", "level", "id", "status"],
      properties: { client: S.client, level: S.level, id: { type: "string" }, status: { type: "string", enum: ["ACTIVE", "PAUSED"] }, confirm_code: S.confirm_code },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const level = oneOf(a, "level", LEVELS);
      const id = metaId(a, "id")!;
      const status = oneOf(a, "status", ["ACTIVE", "PAUSED"] as const);
      const { o, act } = await owned(ctx, c, level, id);
      const t = token(ctx);

      if (status === "ACTIVE") {
        const cur = await currencyOf(ctx, act);
        const budgets: { name: string; status: string; daily?: string; lifetime?: string }[] = [];
        const warnings: string[] = [];
        const addBudget = (name: string, st: string, d?: string, l?: string) => {
          const daily = fromMinor(d, cur);
          if (daily) capCheck(c, daily, cur);
          budgets.push({ name, status: st, ...(daily ? { daily: money(daily, cur) } : {}), ...(fromMinor(l, cur) ? { lifetime: money(fromMinor(l, cur)!, cur) } : {}) });
        };
        if (level === "campaign") {
          if (o.daily_budget || o.lifetime_budget) addBudget(`${o.name} (campaign budget)`, o.status, o.daily_budget, o.lifetime_budget);
          const sets = await graphGetAll<{ name: string; status: string; daily_budget?: string; lifetime_budget?: string }>(
            `/${id}/adsets`,
            { fields: "name,status,daily_budget,lifetime_budget", limit: "50" },
            t,
            2,
          );
          sets.forEach((s) => addBudget(`ad set: ${s.name}`, s.status, s.daily_budget, s.lifetime_budget));
          if (sets.length && sets.every((s) => s.status !== "ACTIVE")) warnings.push("All ad sets are PAUSED, so nothing will spend until an ad set is turned on too.");
        } else if (level === "adset") {
          addBudget(o.name, o.status, o.daily_budget, o.lifetime_budget);
          if (o.campaign?.status !== "ACTIVE") warnings.push(`The campaign "${o.campaign?.name}" is PAUSED, so this won't spend until it is on.`);
        } else {
          if (o.adset) addBudget(`ad set: ${o.adset.name}`, o.adset.status, o.adset.daily_budget, o.adset.lifetime_budget);
          if (o.campaign && (o.campaign.daily_budget || o.campaign.lifetime_budget)) addBudget(`campaign: ${o.campaign.name}`, o.campaign.status, o.campaign.daily_budget, o.campaign.lifetime_budget);
          if (o.adset?.status !== "ACTIVE") warnings.push(`The ad set "${o.adset?.name}" is PAUSED.`);
          if (o.campaign?.status !== "ACTIVE") warnings.push(`The campaign "${o.campaign?.name}" is PAUSED.`);
        }
        if (!c.profile.max_daily_budget) warnings.push(`${c.name} has no daily budget limit set (set_client_config max_daily_budget).`);
        const parts = ["status", level, id, "ACTIVE"];
        if (!confirmOk(ctx, str(a, "confirm_code", 60), parts)) {
          return {
            result: {
              preview: true,
              will_do: `Turn ON ${level} "${o.name}" (now ${o.status}) for ${c.name} in ${act}. It can start spending money.`,
              budgets,
              warnings,
              confirm_code: makeConfirm(ctx, parts),
              note: PREVIEW_NOTE,
            },
          };
        }
      }

      await graphRequest(`/${id}`, { method: "POST", params: { status }, token: t });
      return {
        result: { done: true, id, level, name: o.name, old_status: o.status, new_status: status },
        log: { client: c.name, object_id: id, summary: `${level} "${o.name}": ${o.status} → ${status}`, params: { level, old: o.status, new: status } },
      };
    },
  },
  {
    name: "set_daily_budget",
    title: "Change daily budget",
    description:
      "Change the daily budget of an ad set (or a campaign with campaign budget). Lowering applies at once. Raising first returns a preview with confirm_code; call again with it only after the user says yes.",
    inputSchema: {
      type: "object",
      required: ["client", "level", "id", "daily_budget"],
      properties: {
        client: S.client,
        level: { type: "string", enum: ["campaign", "adset"] },
        id: { type: "string" },
        daily_budget: { type: "number", description: "New amount per day, in the account currency" },
        confirm_code: S.confirm_code,
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const level = oneOf(a, "level", ["campaign", "adset"] as const);
      const id = metaId(a, "id")!;
      const daily = num(a, "daily_budget", 1, 100_000_000);
      if (!daily) throw new ToolError("daily_budget is required.");
      const { o, act } = await owned(ctx, c, level, id);
      const cur = await currencyOf(ctx, act);
      const old = fromMinor(o.daily_budget, cur);
      if (!old) throw new ToolError(`This ${level} has no daily budget (it may use a lifetime budget, or the budget is on the ${level === "adset" ? "campaign" : "ad sets"}).`);
      capCheck(c, daily, cur);
      const minor = Math.round(daily * minorFactor(cur));
      const parts = ["budget", level, id, String(minor)];
      if (daily > old && !confirmOk(ctx, str(a, "confirm_code", 60), parts)) {
        return {
          result: {
            preview: true,
            will_do: `Raise the daily budget of ${level} "${o.name}" (${o.status}) from ${money(old, cur)} to ${money(daily, cur)} (+${money(daily - old, cur)}/day) for ${c.name}.`,
            warnings: o.status === "ACTIVE" ? ["It is running, so the new budget applies from now."] : [],
            confirm_code: makeConfirm(ctx, parts),
            note: PREVIEW_NOTE,
          },
        };
      }
      await graphRequest(`/${id}`, { method: "POST", params: { daily_budget: String(minor) }, token: token(ctx) });
      return {
        result: { done: true, id, name: o.name, old_daily_budget: money(old, cur), new_daily_budget: money(daily, cur) },
        log: { client: c.name, object_id: id, summary: `${level} "${o.name}" daily budget ${money(old, cur)} → ${money(daily, cur)}`, params: { level, old, new: daily, currency: cur } },
      };
    },
  },
  {
    name: "duplicate",
    title: "Duplicate (paused)",
    description: "Copy a campaign (with its ad sets and ads), an ad set (with its ads) or an ad. The copy is always PAUSED.",
    inputSchema: { type: "object", required: ["client", "level", "id"], properties: { client: S.client, level: S.level, id: { type: "string" } } },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const level = oneOf(a, "level", LEVELS);
      const { o, act } = await owned(ctx, c, level, metaId(a, "id")!);
      const copy = await ads.duplicate(token(ctx), o.id, level);
      return {
        result: { copied_from: o.id, new_id: copy, status: "PAUSED", ads_manager: copy ? adsManager(act, level, copy) : null },
        log: { client: c.name, object_id: copy || o.id, summary: `${level} "${o.name}" duplicated (PAUSED)`, params: { from: o.id, level } },
      };
    },
  },
  {
    name: "list_campaigns",
    title: "List campaigns",
    description: "List the client's campaigns with their ad sets, ads, status and budgets.",
    inputSchema: { type: "object", required: ["client"], properties: { client: S.client, ad_account_id: S.ad_account_id } },
    write: false,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const cur = await currencyOf(ctx, act);
      const list = await loadAccountStructure(token(ctx), act, cur);
      return {
        result: {
          ad_account: act,
          currency: cur,
          campaigns: list.slice(0, 60).map((x) => ({
            id: x.id,
            name: x.name,
            status: x.status,
            delivery: x.effective_status,
            objective: x.objective,
            daily_budget: x.daily_budget,
            adsets: x.adsets.map((s) => ({ id: s.id, name: s.name, status: s.status, daily_budget: s.daily_budget, ads: s.ads.map((d) => ({ id: d.id, name: d.name, status: d.status })) })),
          })),
        },
      };
    },
  },
  {
    name: "report",
    title: "Performance report",
    description: "Spend, reach, impressions, clicks, CTR, CPC, purchases and cost per purchase for a client, by account, campaign, ad set or ad, for a date range.",
    inputSchema: {
      type: "object",
      required: ["client"],
      properties: {
        client: S.client,
        ad_account_id: S.ad_account_id,
        level: { type: "string", enum: ["account", "campaign", "adset", "ad"], description: "Default campaign" },
        preset: { type: "string", enum: ["today", "yesterday", "last_7d", "last_30d", "this_month", "last_month"], description: "Default last_7d" },
        since: { type: "string", description: "YYYY-MM-DD (with until, instead of preset)" },
        until: { type: "string", description: "YYYY-MM-DD" },
      },
    },
    write: false,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const level = oneOf(a, "level", ["account", "campaign", "adset", "ad"] as const, "campaign");
      const since = str(a, "since", 10);
      const until = str(a, "until", 10);
      const DATE = /^\d{4}-\d{2}-\d{2}$/;
      let range: Record<string, string>;
      if (since || until) {
        if (!since || !until || !DATE.test(since) || !DATE.test(until) || since > until) throw new ToolError("Give both since and until as YYYY-MM-DD.");
        range = { time_range: JSON.stringify({ since, until }) };
      } else {
        range = { date_preset: oneOf(a, "preset", ["today", "yesterday", "last_7d", "last_30d", "this_month", "last_month"] as const, "last_7d") };
      }
      const idName = level === "account" ? "" : `${level}_id,${level}_name,`;
      const rows = await graphGetAll<Record<string, unknown> & { actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] }>(
        `/${act}/insights`,
        { level, fields: `${idName}spend,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,actions,action_values`, limit: "200", ...range },
        token(ctx),
        5,
      );
      const cur = await currencyOf(ctx, act);
      const out = rows
        .map((r) => {
          const spend = Number(r.spend ?? 0);
          const impressions = Number(r.impressions ?? 0);
          const linkClicks = Number(r.inline_link_clicks ?? 0);
          const purchases = pick(r.actions);
          const value = pick(r.action_values);
          return {
            ...(level === "account" ? {} : { id: r[`${level}_id`], name: r[`${level}_name`] }),
            spend: round(spend),
            reach: Number(r.reach ?? 0),
            impressions,
            frequency: r.frequency ? round(Number(r.frequency)) : null,
            clicks: Number(r.clicks ?? 0),
            link_clicks: linkClicks,
            ctr_percent: r.ctr ? round(Number(r.ctr)) : null,
            link_ctr_percent: impressions ? round((linkClicks / impressions) * 100) : null,
            cpc: r.cpc ? round(Number(r.cpc), 4) : null,
            purchases,
            cost_per_purchase: purchases ? round(spend / purchases, 4) : null,
            purchase_value: round(value),
            roas: spend ? round(value / spend) : null,
          };
        })
        .sort((x, y) => y.spend - x.spend);
      const total = out.reduce((s, r) => ({ spend: s.spend + r.spend, link_clicks: s.link_clicks + r.link_clicks, purchases: s.purchases + r.purchases }), { spend: 0, link_clicks: 0, purchases: 0 });
      return {
        result: {
          client: c.name,
          ad_account: act,
          currency: cur,
          dates: since ? `${since} to ${until}` : range.date_preset,
          level,
          totals: { spend: round(total.spend), link_clicks: total.link_clicks, purchases: total.purchases, cost_per_purchase: total.purchases ? round(total.spend / total.purchases) : null },
          rows: out.slice(0, 50),
          note: level === "account" ? undefined : "Reach can't be added up across rows; use level=account for total reach.",
        },
      };
    },
  },
  {
    name: "create_video_audience",
    title: "Video viewers audience",
    description: "Create a custom audience of people who watched the client's videos (default: videos in active ads) in the last N days.",
    inputSchema: {
      type: "object",
      required: ["client"],
      properties: {
        client: S.client,
        ad_account_id: S.ad_account_id,
        days: { type: "number", description: "1-365, default 30" },
        watched: { type: "string", enum: Object.keys(ads.VIDEO_EVENTS), description: "How much they watched; default 3s" },
        video_ids: { type: "array", items: { type: "string" }, description: "Default: videos of the account's active ads" },
        name: { type: "string" },
      },
    },
    write: true,
    run: async (ctx, a) => {
      const c = findClient(ctx, a);
      const act = pickAccount(c, a);
      const t = token(ctx);
      const days = Math.round(num(a, "days", 1, 365) ?? 30);
      const watched = oneOf(a, "watched", Object.keys(ads.VIDEO_EVENTS) as ads.VideoWatch[], "3s");
      const given = names(a, "video_ids");
      if (given?.some((v) => !/^\d{5,25}$/.test(v))) throw new ToolError("video_ids must be Meta video ids.");
      const videos = given?.length ? given : await activeAdVideos(t, act);
      if (!videos.length) throw new ToolError("No videos found in active ads. Send video_ids.");
      const name = str(a, "name", 200) ?? `Hook · Video ${watched} · ${days}d · ${c.name}`;
      const id = await ads.createVideoAudience(t, act, name, videos, days, watched);
      return {
        result: { audience_id: id, name, videos: videos.length, days, watched, note: "Meta fills the audience over the next hours." },
        log: { client: c.name, object_id: id, summary: `Video audience "${name}" created (${videos.length} videos)`, params: { days, watched, videos: videos.length } },
      };
    },
  },
  {
    name: "action_log",
    title: "Change log",
    description: "Show the latest changes made through this connector (who, when, what).",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Default 20, max 100" } } },
    write: false,
    run: async (ctx, a) => {
      const { data, error } = await ctx.supabase.rpc("mcp_recent_log", { p_access_hash: ctx.accessHash, p_limit: Math.round(num(a, "limit", 1, 100) ?? 20) });
      if (error) throw new ToolError("Couldn't read the log.");
      return { result: data };
    },
  },
];

export async function writeLog(ctx: Ctx, tool: string, ok: boolean, log: ToolOut["log"] | undefined, error?: string, args?: Args) {
  const { error: e } = await ctx.supabase.rpc("mcp_log", {
    p_access_hash: ctx.accessHash,
    p_client_name: log?.client ?? (typeof args?.client === "string" ? args.client : null),
    p_tool: tool,
    p_object_id: log?.object_id ?? (typeof args?.id === "string" ? args.id : null),
    p_summary: log?.summary ?? (ok ? tool : `${tool} failed`),
    p_params: log?.params ?? {},
    p_ok: ok,
    p_error: error ?? null,
  });
  if (e) console.error("mcp log failed", e.message);
}
