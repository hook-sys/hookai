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
  media: { path: string; kind: "image" | "video"; name: string }[];
  start_active?: boolean;
  rules?: string; // নির্দেশনায় লেখা নিয়ম (পরের ধাপে স্বয়ংক্রিয়)
};

export const SALES_CTAS = ["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE", "GET_OFFER", "SIGN_UP"] as const;

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

function targeting(spec: LaunchSpec) {
  const countries = spec.locations.filter((l) => l.type === "country").map((l) => l.key);
  const regions = spec.locations.filter((l) => l.type === "region").map((l) => ({ key: l.key }));
  const cities = spec.locations.filter((l) => l.type === "city").map((l) => ({ key: l.key }));
  const geo =
    countries.length || (!regions.length && !cities.length)
      ? { countries: countries.length ? countries : ["BD"] }
      : { ...(regions.length ? { regions } : {}), ...(cities.length ? { cities } : {}) };
  return {
    geo_locations: geo,
    age_min: spec.age_min,
    age_max: spec.age_max,
    ...(spec.gender === "male" ? { genders: [1] } : spec.gender === "female" ? { genders: [2] } : {}),
    ...(spec.interests.length ? { flexible_spec: [{ interests: spec.interests.map((i) => ({ id: i.id, name: i.name })) }] } : {}),
    ...(spec.include_audiences?.length ? { custom_audiences: spec.include_audiences.map((a) => ({ id: a.id })) } : {}),
    ...(spec.exclude_audiences?.length ? { excluded_custom_audiences: spec.exclude_audiences.map((a) => ({ id: a.id })) } : {}),
    // নিজের দেওয়া টার্গেটিং মানা হয়; Meta নিজে বাড়িয়ে দেবে না
    targeting_automation: { advantage_audience: 0 },
  };
}

export async function createCampaign(token: string, accountId: string, spec: LaunchSpec) {
  const res = await post<{ id: string }>(token, `/${accountId}/campaigns`, {
    name: spec.name,
    objective: spec.objective === "sales" ? "OUTCOME_SALES" : "OUTCOME_ENGAGEMENT",
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
    // বাজেট Ad Set-এ
    is_adset_budget_sharing_enabled: "false",
  });
  return res.id;
}

export async function createAdSet(token: string, accountId: string, campaignId: string, spec: LaunchSpec, currency: string | null) {
  const common = {
    name: `${spec.name} · Ad set`,
    campaign_id: campaignId,
    daily_budget: String(Math.round(spec.daily_budget * minorFactor(currency))),
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify(targeting(spec)),
    status: "PAUSED",
  };
  const params =
    spec.objective === "sales"
      ? {
          ...common,
          optimization_goal: "OFFSITE_CONVERSIONS",
          promoted_object: JSON.stringify({ pixel_id: spec.pixel_id, custom_event_type: "PURCHASE" }),
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
      ? { type: spec.cta, value: { link } }
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
          image_hash: media.imageHash,
          call_to_action: cta,
        },
      };
  const res = await post<{ id: string }>(token, `/${accountId}/adcreatives`, {
    name: `${spec.name} · Creative`,
    object_story_spec: JSON.stringify(story),
    ...(spec.objective === "sales" ? { url_tags: URL_TAGS } : {}),
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
