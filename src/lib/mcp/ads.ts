import { graphRequest } from "@/lib/meta/graph";
import { ATTRIBUTIONS, searchLocations, URL_TAGS } from "@/lib/meta/launch";

// Claude কানেক্টরের জন্য বিজ্ঞাপন তৈরি: Sales বা Traffic, ব্রড অডিয়েন্স, Advantage+ placements।
// যা-ই তৈরি হোক, সবসময় PAUSED। চালু করতে আলাদা কল (preview + confirm) লাগে।

export type Objective = "sales" | "traffic";
export type GeoPick = { key: string; name: string; type: "country" | "region" | "city" };

const post = <T>(token: string, path: string, params: Record<string, string>, timeoutMs = 30_000) =>
  graphRequest<T>(path, { method: "POST", params, token, timeoutMs });

export const OBJECTIVE_META: Record<Objective, string> = { sales: "OUTCOME_SALES", traffic: "OUTCOME_TRAFFIC" };
export const objectiveFromMeta = (o: string | undefined): Objective | null =>
  o === "OUTCOME_SALES" || o === "CONVERSIONS" ? "sales" : o === "OUTCOME_TRAFFIC" || o === "LINK_CLICKS" ? "traffic" : null;

// "শুধু শহর এলাকা": বাংলাদেশের বড় শহরগুলো (Meta-তে "urban" বলে আলাদা কিছু নেই)
const URBAN_CITIES = ["Dhaka", "Chittagong", "Gazipur", "Narayanganj", "Sylhet", "Khulna", "Rajshahi", "Comilla", "Mymensingh", "Rangpur", "Barisal", "Bogra"];
let urbanCache: { at: number; list: GeoPick[] } | null = null;

export async function urbanBangladesh(token: string): Promise<GeoPick[]> {
  if (urbanCache && Date.now() - urbanCache.at < 24 * 3600_000) return urbanCache.list;
  const found = await Promise.allSettled(
    URBAN_CITIES.map(async (name) => {
      const hits = await searchLocations(token, name, 5);
      return hits.find((h) => h.type === "city" && h.name.toLowerCase().startsWith(name.toLowerCase())) ?? null;
    }),
  );
  const list = found.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value as GeoPick] : []));
  if (list.length) urbanCache = { at: Date.now(), list };
  return list.length ? list : [{ key: "BD", name: "Bangladesh", type: "country" }];
}

export async function resolveLocations(token: string, names: string[]): Promise<GeoPick[]> {
  const out: GeoPick[] = [];
  for (const n of names.slice(0, 25)) {
    const q = n.trim();
    if (/^(urban|cities|শহর)$/i.test(q)) {
      out.push(...(await urbanBangladesh(token)));
      continue;
    }
    const hit = (await searchLocations(token, q, 1))[0];
    if (!hit) throw new Error(`Couldn't find the location "${q}" in Bangladesh.`);
    out.push(hit as GeoPick);
  }
  return out;
}

export function buildTargeting(geo: GeoPick[], ageMin: number, ageMax: number, gender: "all" | "male" | "female") {
  const countries = geo.filter((l) => l.type === "country").map((l) => l.key);
  const regions = geo.filter((l) => l.type === "region").map((l) => ({ key: l.key }));
  const cities = geo.filter((l) => l.type === "city").map((l) => ({ key: l.key }));
  return {
    geo_locations: countries.length ? { countries } : { ...(regions.length ? { regions } : {}), ...(cities.length ? { cities } : {}) },
    age_min: ageMin,
    age_max: ageMax,
    ...(gender === "male" ? { genders: [1] } : gender === "female" ? { genders: [2] } : {}),
    // ব্রড: কোনো interest নেই। বয়স যেন মানা হয় তাই Advantage+ audience বন্ধ।
    targeting_automation: { advantage_audience: 0 },
  };
}

export async function createCampaign(token: string, accountId: string, name: string, objective: Objective) {
  const res = await post<{ id: string }>(token, `/${accountId}/campaigns`, {
    name,
    objective: OBJECTIVE_META[objective],
    status: "PAUSED",
    special_ad_categories: "[]",
    buying_type: "AUCTION",
    // বাজেট Ad Set-এ
    is_adset_budget_sharing_enabled: "false",
  });
  return res.id;
}

export async function createAdSet(
  token: string,
  accountId: string,
  p: { campaignId: string; name: string; objective: Objective; dailyBudgetMinor: number; targeting: object; pixelId?: string | null },
) {
  const common: Record<string, string> = {
    name: p.name,
    campaign_id: p.campaignId,
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: String(Math.round(p.dailyBudgetMinor)),
    targeting: JSON.stringify(p.targeting),
    status: "PAUSED",
  };
  const params =
    p.objective === "sales"
      ? {
          ...common,
          optimization_goal: "OFFSITE_CONVERSIONS",
          promoted_object: JSON.stringify({ pixel_id: p.pixelId, custom_event_type: "PURCHASE" }),
          attribution_spec: JSON.stringify(ATTRIBUTIONS["7d_click_1d_view"]),
        }
      : { ...common, optimization_goal: "LINK_CLICKS", destination_type: "WEBSITE" };
  const res = await post<{ id: string }>(token, `/${accountId}/adsets`, params);
  return res.id;
}

export async function createCreative(
  token: string,
  accountId: string,
  p: {
    name: string;
    pageId: string;
    instagramId: string | null;
    link: string;
    primaryText: string;
    headline: string;
    description?: string;
    cta: string;
    imageHash?: string;
    videoId?: string;
    thumbnail?: string | null;
  },
) {
  const cta = { type: p.cta, value: { link: p.link } };
  const story = p.videoId
    ? {
        page_id: p.pageId,
        ...(p.instagramId ? { instagram_user_id: p.instagramId } : {}),
        video_data: {
          video_id: p.videoId,
          message: p.primaryText,
          title: p.headline,
          ...(p.description ? { link_description: p.description } : {}),
          ...(p.thumbnail ? { image_url: p.thumbnail } : {}),
          call_to_action: cta,
        },
      }
    : {
        page_id: p.pageId,
        ...(p.instagramId ? { instagram_user_id: p.instagramId } : {}),
        link_data: {
          link: p.link,
          message: p.primaryText,
          name: p.headline,
          ...(p.description ? { description: p.description } : {}),
          image_hash: p.imageHash,
          call_to_action: cta,
        },
      };
  const res = await post<{ id: string }>(token, `/${accountId}/adcreatives`, {
    name: `${p.name} · Creative`.slice(0, 200),
    object_story_spec: JSON.stringify(story),
    url_tags: URL_TAGS,
  });
  return res.id;
}

// কপি: সবসময় PAUSED অবস্থায়
export async function duplicate(token: string, id: string, level: "campaign" | "adset" | "ad") {
  const res = await post<Record<string, unknown>>(token, `/${id}/copies`, {
    status_option: "PAUSED",
    ...(level === "ad" ? {} : { deep_copy: "true" }),
  }, 60_000);
  const key = level === "campaign" ? "copied_campaign_id" : level === "adset" ? "copied_adset_id" : "copied_ad_id";
  return String(res[key] ?? "");
}

// ভিডিও দেখেছে এমন মানুষ (পেজের পোস্টে চলা ভিডিও লাগে)
export const VIDEO_EVENTS = {
  "3s": "video_watched",
  "10s": "video_view_10s",
  "25%": "video_view_25_percent",
  "50%": "video_view_50_percent",
  "75%": "video_view_75_percent",
  "95%": "video_completed",
} as const;
export type VideoWatch = keyof typeof VIDEO_EVENTS;

export async function createVideoAudience(token: string, accountId: string, name: string, videoIds: string[], days: number, watched: VideoWatch) {
  const res = await post<{ id: string }>(token, `/${accountId}/customaudiences`, {
    name: name.slice(0, 200),
    subtype: "ENGAGEMENT",
    retention_days: String(days),
    prefill: "true",
    rule: JSON.stringify(videoIds.map((id) => ({ event_name: VIDEO_EVENTS[watched], object_id: id }))),
  });
  return res.id;
}
