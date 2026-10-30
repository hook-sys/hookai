import { graphRequest } from "./graph";
import { minorFactor } from "./manage";

// নতুন বিজ্ঞাপন তৈরি: ক্যাম্পেইন → Ad Set → ছবি/ভিডিও → Creative → Ad। সব কিছু প্রথমে PAUSED থাকে।

export type LaunchObjective = "sales" | "messages";
export type Gender = "all" | "male" | "female";

export type LaunchSpec = {
  name: string;
  objective: LaunchObjective;
  page_id: string;
  page_name?: string;
  pixel_id?: string | null;
  link?: string | null; // ওয়েবসাইট (Sales-এ লাগে)
  daily_budget: number; // অ্যাকাউন্টের মুদ্রায়, মূল এককে
  locations: { key: string; name: string; type: "country" | "region" | "city" }[];
  age_min: number;
  age_max: number;
  gender: Gender;
  interests: { id: string; name: string }[];
  // রিটার্গেটিং: এদের দেখাও / এদের বাদ দাও (যেমন ক্রেতা)
  include_audiences?: { id: string; name: string }[];
  exclude_audiences?: { id: string; name: string }[];
  primary_text: string;
  headline: string;
  description?: string;
  cta: string;
  // path: আপলোড করা ফাইল ("userId/..."), নয়তো উৎস চিহ্ন: "drive:ID", "video:ID" (আগের ভিডিও),
  // "image:HASH" (আগের ছবি), "post:PAGEID_POSTID" (আগের পুরো পোস্ট, লাইক-কমেন্টসহ)
  media: { path: string; kind: "image" | "video"; name: string; thumb?: string | null }[];
  start_active?: boolean;
  rules?: string; // নির্দেশনায় লেখা নিয়ম (পরের ধাপে স্বয়ংক্রিয়)

  // ---- Ads Manager-এর মতো বাড়তি সেটিং (না থাকলে আগের মতো সাধারণ মান) ----
  adset_name?: string;
  ad_name?: string;
  // বাজেট কোথায়: Ad Set-এ, নাকি ক্যাম্পেইনে (Advantage+ campaign budget)
  budget_mode?: "adset" | "campaign";
  // daily_budget ঘরেই টাকার অঙ্ক থাকে; lifetime হলে সেটাই পুরো সময়ের বাজেট
  budget_type?: "daily" | "lifetime";
  bid_strategy?: BidStrategy;
  bid_amount?: number | null; // Cost cap বা Bid cap, অ্যাকাউন্টের মুদ্রায়
  start_time?: string | null; // "2026-10-30T10:00", ঢাকার সময়
  end_time?: string | null;
  conversion_event?: ConversionEvent;
  attribution?: AttributionId;
  advantage_audience?: boolean;
  placements?: Placements;
  use_instagram?: boolean; // পেজের সাথে যুক্ত Instagram থেকেও দেখানো
  display_link?: string;
  url_tags?: string;
  // Meta-তে তৈরি হলে এই নিয়মগুলো নিজে বসে যায় (রুলের টেমপ্লেট আর টার্গেট খরচ)
  rule_templates?: string[];
  rule_target?: number | null;
};

// আপলোড করা ফাইল কিনা (অন্য উৎসে "drive:" ইত্যাদি চিহ্ন থাকে)
export const isStoragePath = (path: string) => !/^(drive|video|image|post):/.test(path);

export type BidStrategy = "LOWEST_COST_WITHOUT_CAP" | "COST_CAP" | "LOWEST_COST_WITH_BID_CAP";
export const BID_STRATEGIES: BidStrategy[] = ["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_BID_CAP"];

export const CONVERSION_EVENTS = ["PURCHASE", "INITIATED_CHECKOUT", "ADD_TO_CART", "CONTENT_VIEW", "LEAD", "COMPLETE_REGISTRATION"] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

export const ATTRIBUTIONS = {
  "7d_click_1d_view": [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }],
  "7d_click": [{ event_type: "CLICK_THROUGH", window_days: 7 }],
  "1d_click_1d_view": [{ event_type: "CLICK_THROUGH", window_days: 1 }, { event_type: "VIEW_THROUGH", window_days: 1 }],
  "1d_click": [{ event_type: "CLICK_THROUGH", window_days: 1 }],
} as const;
export type AttributionId = keyof typeof ATTRIBUTIONS;

// ম্যানুয়াল প্লেসমেন্ট: কোন প্ল্যাটফর্মের কোন জায়গায় দেখাবে
export const PLACEMENT_POSITIONS = {
  facebook: ["feed", "profile_feed", "marketplace", "video_feeds", "right_hand_column", "story", "facebook_reels", "instream_video", "search"],
  instagram: ["stream", "profile_feed", "explore", "explore_home", "story", "reels", "ig_search"],
  messenger: ["story"],
  audience_network: ["classic", "rewarded_video"],
} as const;
export type Platform = keyof typeof PLACEMENT_POSITIONS;
export type Placements =
  | { mode: "auto" }
  | { mode: "manual"; platforms: Platform[]; positions: Partial<Record<Platform, string[]>>; devices: ("mobile" | "desktop")[] };

export const SALES_CTAS = ["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE", "GET_OFFER", "SIGN_UP", "CONTACT_US", "SUBSCRIBE", "GET_QUOTE", "APPLY_NOW"] as const;

// অর্ডার ক্যাম্পেইনের সাথে মেলাতে প্রতিটি লিংকে বসে
export const URL_TAGS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.id}}";

const post = <T>(token: string, path: string, params: Record<string, string>, timeoutMs = 30_000) =>
  graphRequest<T>(path, { method: "POST", params, token, timeoutMs });
const get = <T>(token: string, path: string, params: Record<string, string> = {}) => graphRequest<T>(path, { params, token });

// ---------- বাছাইয়ের তালিকা ----------

export async function listPromotePages(token: string, accountId: string) {
  const res = await get<{ data: { id: string; name: string }[] }>(token, `/${accountId}/promote_pages`, { fields: "id,name", limit: "100" });
  return res.data;
}

export async function listPixels(token: string, accountId: string) {
  const res = await get<{ data: { id: string; name: string; last_fired_time?: string }[] }>(token, `/${accountId}/adspixels`, {
    fields: "id,name,last_fired_time",
    limit: "50",
  });
  return res.data;
}

type GeoHit = { key: string; name: string; type: "country" | "region" | "city" };

// "Dhaka", "Chattogram" → Meta-র লোকেশন key। বাংলাদেশের ভেতরে খোঁজে।
export async function searchLocations(token: string, q: string, limit = 8): Promise<GeoHit[]> {
  if (/^(bangladesh|বাংলাদেশ|bd|all bangladesh|সারা দেশ)$/i.test(q.trim())) return [{ key: "BD", name: "Bangladesh", type: "country" }];
  const res = await get<{ data: { key: string; name: string; type: string; region?: string }[] }>(token, "/search", {
    type: "adgeolocation",
    q,
    country_code: "BD",
    location_types: JSON.stringify(["city", "region"]),
    limit: String(limit),
  });
  return res.data
    .filter((h) => h.type === "city" || h.type === "region")
    .map((h) => ({ key: h.key, name: h.region && h.type === "city" ? `${h.name} (${h.region})` : h.name, type: h.type as "city" | "region" }));
}

export async function searchInterests(token: string, q: string, limit = 8) {
  const res = await get<{ data: { id: string; name: string; audience_size_upper_bound?: number }[] }>(token, "/search", {
    type: "adinterest",
    q,
    limit: String(limit),
  });
  return res.data.map((i) => ({ id: i.id, name: i.name, size: i.audience_size_upper_bound ?? null }));
}

export async function findLocation(token: string, q: string) {
  return (await searchLocations(token, q, 1))[0] ?? null;
}

export async function findInterest(token: string, q: string) {
  return (await searchInterests(token, q, 1))[0] ?? null;
}

// ---------- মিডিয়া ----------

export async function uploadImage(token: string, accountId: string, bytes: Buffer, name: string) {
  const res = await post<{ images: Record<string, { hash: string }> }>(token, `/${accountId}/adimages`, {
    bytes: bytes.toString("base64"),
    name: name.slice(0, 100),
  }, 120_000);
  const first = Object.values(res.images)[0];
  if (!first?.hash) throw new Error("Meta didn't return an image hash");
  return first.hash;
}

// Meta নিজে লিংক থেকে ভিডিও নামায়; প্রসেস হতে কিছু সময় লাগে
export async function startVideoUpload(token: string, accountId: string, fileUrl: string, name: string) {
  const res = await post<{ id: string }>(token, `/${accountId}/advideos`, { file_url: fileUrl, name: name.slice(0, 100) });
  return res.id;
}

export async function videoState(token: string, videoId: string) {
  const res = await get<{
    status?: { video_status?: string };
    picture?: string;
    thumbnails?: { data: { uri: string; is_preferred?: boolean }[] };
  }>(token, `/${videoId}`, { fields: "status,picture,thumbnails{uri,is_preferred}" });
  // picture মাত্র ১৬০px; বিজ্ঞাপনের জন্য Meta-র পূর্ণ মাপের (পছন্দের) থাম্বনেইল নেওয়া হয়
  const thumbs = res.thumbnails?.data ?? [];
  const best = thumbs.find((t) => t.is_preferred) ?? thumbs[0];
  return { status: res.status?.video_status ?? "processing", thumbnail: best?.uri ?? res.picture ?? null };
}

export async function pageInstagram(token: string, pageId: string) {
  try {
    const res = await get<{ instagram_business_account?: { id: string } }>(token, `/${pageId}`, { fields: "instagram_business_account" });
    return res.instagram_business_account?.id ?? null;
  } catch {
    return null;
  }
}

// ---------- তৈরি ----------

// ঢাকার সময় (+06:00) ধরে Meta-কে পাঠানো
export const dhakaTime = (local: string) => `${local.length === 16 ? `${local}:00` : local}+0600`;

function placementTargeting(p: Placements | undefined) {
  if (!p || p.mode === "auto") return {};
  const platforms = p.platforms.length ? p.platforms : (["facebook"] as Platform[]);
  const pos = (k: Platform) => (platforms.includes(k) && p.positions[k]?.length ? { [`${k}_positions`]: p.positions[k] } : {});
  return {
    publisher_platforms: platforms,
    ...pos("facebook"),
    ...pos("instagram"),
    ...pos("messenger"),
    ...pos("audience_network"),
    ...(p.devices.length === 1 ? { device_platforms: p.devices } : {}),
  };
}

export function targeting(spec: LaunchSpec) {
  const countries = spec.locations.filter((l) => l.type === "country").map((l) => l.key);
  const regions = spec.locations.filter((l) => l.type === "region").map((l) => ({ key: l.key }));
  const cities = spec.locations.filter((l) => l.type === "city").map((l) => ({ key: l.key }));
  const geo =
    countries.length || (!regions.length && !cities.length)
      ? { countries: countries.length ? countries : ["BD"] }
      : { ...(regions.length ? { regions } : {}), ...(cities.length ? { cities } : {}) };
  return {
    geo_locations: geo,
    // Advantage+ audience-এ Meta বয়স ৬৫ পর্যন্ত আর সর্বনিম্ন ২৫-এর বেশি নিতে দেয় না
    age_min: spec.advantage_audience ? Math.min(spec.age_min, 25) : spec.age_min,
    age_max: spec.advantage_audience ? 65 : spec.age_max,
    ...(spec.gender === "male" ? { genders: [1] } : spec.gender === "female" ? { genders: [2] } : {}),
    ...(spec.interests.length ? { flexible_spec: [{ interests: spec.interests.map((i) => ({ id: i.id, name: i.name })) }] } : {}),
    ...(spec.include_audiences?.length ? { custom_audiences: spec.include_audiences.map((a) => ({ id: a.id })) } : {}),
    ...(spec.exclude_audiences?.length ? { excluded_custom_audiences: spec.exclude_audiences.map((a) => ({ id: a.id })) } : {}),
    ...placementTargeting(spec.placements),
    // বন্ধ: নিজের দেওয়া টার্গেটিং মানা হয়। চালু (Advantage+ audience): Meta এগুলোকে পরামর্শ ধরে আরও মানুষ খোঁজে
    targeting_automation: { advantage_audience: spec.advantage_audience ? 1 : 0 },
  };
}

const money = (v: number, currency: string | null) => String(Math.round(v * minorFactor(currency)));

export async function createCampaign(token: string, accountId: string, spec: LaunchSpec, currency: string | null) {
  const cbo = spec.budget_mode === "campaign";
  const res = await post<{ id: string }>(token, `/${accountId}/campaigns`, {
    name: spec.name,
    objective: spec.objective === "sales" ? "OUTCOME_SALES" : "OUTCOME_ENGAGEMENT",
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
    ...(cbo
      ? {
          // Advantage+ campaign budget: বাজেট ক্যাম্পেইনে, Meta Ad Set-গুলোর মধ্যে ভাগ করে
          [spec.budget_type === "lifetime" ? "lifetime_budget" : "daily_budget"]: money(spec.daily_budget, currency),
          bid_strategy: spec.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
        }
      : { is_adset_budget_sharing_enabled: "false" }),
  });
  return res.id;
}

export async function createAdSet(token: string, accountId: string, campaignId: string, spec: LaunchSpec, currency: string | null) {
  const cbo = spec.budget_mode === "campaign";
  const bid = spec.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP";
  const common: Record<string, string> = {
    name: spec.adset_name || `${spec.name} · Ad set`,
    campaign_id: campaignId,
    billing_event: "IMPRESSIONS",
    targeting: JSON.stringify(targeting(spec)),
    status: "PAUSED",
    ...(cbo
      ? {}
      : {
          [spec.budget_type === "lifetime" ? "lifetime_budget" : "daily_budget"]: money(spec.daily_budget, currency),
          bid_strategy: bid,
        }),
    ...(bid !== "LOWEST_COST_WITHOUT_CAP" && spec.bid_amount ? { bid_amount: money(spec.bid_amount, currency) } : {}),
    ...(spec.start_time ? { start_time: dhakaTime(spec.start_time) } : {}),
    ...(spec.end_time ? { end_time: dhakaTime(spec.end_time) } : {}),
  };
  const params =
    spec.objective === "sales"
      ? {
          ...common,
          optimization_goal: "OFFSITE_CONVERSIONS",
          promoted_object: JSON.stringify({ pixel_id: spec.pixel_id, custom_event_type: spec.conversion_event ?? "PURCHASE" }),
          attribution_spec: JSON.stringify(ATTRIBUTIONS[spec.attribution ?? "7d_click_1d_view"]),
        }
      : {
          ...common,
          optimization_goal: "CONVERSATIONS",
          destination_type: "MESSENGER",
          promoted_object: JSON.stringify({ page_id: spec.page_id }),
        };
  const res = await post<{ id: string }>(token, `/${accountId}/adsets`, params);
  return res.id;
}

// Ads Manager-এর "Audience definition": দর্শক কত বড় আর এই বাজেটে দিনে কতজনের কাছে যাবে (আন্দাজ)
export async function deliveryEstimate(token: string, accountId: string, spec: LaunchSpec, currency: string | null) {
  const res = await get<{
    data: {
      estimate_mau_lower_bound?: number;
      estimate_mau_upper_bound?: number;
      daily_outcomes_curve?: { spend: number; reach: number; actions: number }[];
    }[];
  }>(token, `/${accountId}/delivery_estimate`, {
    targeting_spec: JSON.stringify(targeting(spec)),
    optimization_goal: spec.objective === "sales" ? "OFFSITE_CONVERSIONS" : "CONVERSATIONS",
    promoted_object: JSON.stringify(
      spec.objective === "sales" ? { pixel_id: spec.pixel_id, custom_event_type: spec.conversion_event ?? "PURCHASE" } : { page_id: spec.page_id },
    ),
  });
  const d = res.data[0];
  if (!d) return null;
  // দৈনিক বাজেটে বক্ররেখা থেকে দৈনিক reach (মোট বাজেট হলে দিন হিসাবে ভাগ করা যায় না, তাই শুধু দৈনিকে)
  let reach: [number, number] | null = null;
  const curve = d.daily_outcomes_curve ?? [];
  if (curve.length && spec.budget_type !== "lifetime") {
    const spend = spec.daily_budget * minorFactor(currency);
    const pt = curve.reduce((best, c) => (Math.abs(c.spend - spend) < Math.abs(best.spend - spend) ? c : best), curve[0]);
    if (pt.reach > 0) reach = [Math.round(pt.reach * 0.75), Math.round(pt.reach * 1.25)];
  }
  return { low: d.estimate_mau_lower_bound ?? null, high: d.estimate_mau_upper_bound ?? null, dailyReach: reach };
}

export async function createCreative(
  token: string,
  accountId: string,
  spec: LaunchSpec,
  media: { imageHash?: string; videoId?: string; thumbnail?: string | null },
  instagramId: string | null,
) {
  const link = spec.objective === "sales" ? spec.link! : "https://fb.com/messenger_doc/";
  const cta =
    spec.objective === "sales"
      ? { type: spec.cta, value: { link, ...(spec.display_link && media.videoId ? { link_caption: spec.display_link } : {}) } }
      : { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } };
  const story = media.videoId
    ? {
        page_id: spec.page_id,
        ...(instagramId ? { instagram_user_id: instagramId } : {}),
        video_data: {
          video_id: media.videoId,
          message: spec.primary_text,
          title: spec.headline,
          ...(spec.description ? { link_description: spec.description } : {}),
          ...(media.thumbnail ? { image_url: media.thumbnail } : {}),
          call_to_action: cta,
        },
      }
    : {
        page_id: spec.page_id,
        ...(instagramId ? { instagram_user_id: instagramId } : {}),
        link_data: {
          link,
          message: spec.primary_text,
          name: spec.headline,
          ...(spec.description ? { description: spec.description } : {}),
          ...(spec.display_link ? { caption: spec.display_link } : {}),
          image_hash: media.imageHash,
          call_to_action: cta,
        },
      };
  const res = await post<{ id: string }>(token, `/${accountId}/adcreatives`, {
    name: `${spec.name} · Creative`,
    object_story_spec: JSON.stringify(story),
    ...(spec.objective === "sales" ? { url_tags: spec.url_tags?.trim() || URL_TAGS } : {}),
  });
  return res.id;
}

// আগের পোস্টটাই বিজ্ঞাপন: লেখা-ছবি সেই পোস্টের, লাইক-কমেন্টও থাকে
export async function createPostCreative(token: string, accountId: string, name: string, postId: string, instagramId: string | null) {
  const res = await post<{ id: string }>(token, `/${accountId}/adcreatives`, {
    name: name.slice(0, 200),
    object_story_id: postId,
    ...(instagramId ? { instagram_user_id: instagramId } : {}),
  });
  return res.id;
}

export async function createAd(token: string, accountId: string, adsetId: string, creativeId: string, name: string) {
  const res = await post<{ id: string }>(token, `/${accountId}/ads`, {
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: "PAUSED",
  });
  return res.id;
}
