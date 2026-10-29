import { graphGetAll, graphRequest } from "./graph";
import { HOOK_PREFIX } from "./audiencePresets";

// প্রোডাক্ট ধরে অডিয়েন্স: একটা লিংক দিলে সেই লিংকের বিজ্ঞাপনগুলোর ভিডিও দর্শক (২৫/৫০/৭৫/৯৫%, ThruPlay)
// আর সেই পাতার ওয়েবসাইট ভিজিটর/প্রোডাক্ট দেখা/কার্টে রাখা। মূল ওয়েবসাইটের লিংক দিলে পুরো সাইট ধরে।

export const VIDEO_EVENTS = {
  v25: { event: "video_view_25_percent", label: ["25% viewers", "২৫% দেখেছে"] },
  v50: { event: "video_view_50_percent", label: ["50% viewers", "৫০% দেখেছে"] },
  v75: { event: "video_view_75_percent", label: ["75% viewers", "৭৫% দেখেছে"] },
  v95: { event: "video_completed", label: ["95% viewers", "৯৫% দেখেছে"] },
  thruplay: { event: "video_view_15s", label: ["ThruPlay (15s)", "ThruPlay (১৫ সেকেন্ড)"] },
} as const;
export type VideoKind = keyof typeof VIDEO_EVENTS;

export const WEB_EVENTS = {
  visitors: { event: "PageView", label: ["Visited the page", "পাতায় এসেছে"], excludeBuyers: false },
  viewed: { event: "ViewContent", label: ["Viewed the product", "প্রোডাক্ট দেখেছে"], excludeBuyers: true },
  cart: { event: "AddToCart", label: ["Added to cart, didn't buy", "কার্টে রেখেছে, কেনেনি"], excludeBuyers: true },
  checkout: { event: "InitiateCheckout", label: ["Started checkout, didn't buy", "চেকআউট শুরু করেছে, কেনেনি"], excludeBuyers: true },
  buyers: { event: "Purchase", label: ["Bought", "কিনেছে"], excludeBuyers: false },
} as const;
export type WebKind = keyof typeof WEB_EVENTS;

export type AdWithLink = { id: string; name: string; status: string; link: string | null; videos: string[]; matched: boolean };

// তুলনার জন্য লিংক: http/www/প্রশ্নচিহ্নের পরের অংশ/শেষের / বাদ, ছোট হাতের
export function cleanUrl(raw: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase();
    return { host, path, whole: path === "" };
  } catch {
    return null;
  }
}

// বিজ্ঞাপনের লিংক এই প্রোডাক্টের (বা মূল সাইট দিলে এই সাইটের) কিনা
export function linkMatches(adLink: string | null, target: NonNullable<ReturnType<typeof cleanUrl>>) {
  if (!adLink) return false;
  const a = cleanUrl(adLink);
  if (!a || a.host !== target.host) return false;
  return target.whole || a.path === target.path || a.path.startsWith(`${target.path}/`);
}

type RawAd = {
  id: string;
  name: string;
  effective_status: string;
  creative?: {
    video_id?: string;
    object_story_spec?: {
      link_data?: { link?: string; call_to_action?: { value?: { link?: string } } };
      video_data?: { video_id?: string; call_to_action?: { value?: { link?: string } } };
    };
    asset_feed_spec?: { link_urls?: { website_url?: string }[]; videos?: { video_id?: string }[] };
  };
};

// অ্যাকাউন্টের বিজ্ঞাপন (মোছা ছাড়া), প্রতিটার লিংক আর ভিডিও
export async function adsWithLinks(token: string, accountId: string, productUrl: string): Promise<AdWithLink[]> {
  const target = cleanUrl(productUrl);
  const rows = await graphGetAll<RawAd>(
    `/${accountId}/ads`,
    {
      fields: "name,effective_status,creative{video_id,object_story_spec,asset_feed_spec{link_urls,videos}}",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "PENDING_REVIEW", "WITH_ISSUES", "IN_PROCESS"]),
      limit: "100",
    },
    token,
    4,
  );
  return rows
    .map((a) => {
      const c = a.creative ?? {};
      const oss = c.object_story_spec ?? {};
      const links = [
        oss.link_data?.link,
        oss.link_data?.call_to_action?.value?.link,
        oss.video_data?.call_to_action?.value?.link,
        ...(c.asset_feed_spec?.link_urls ?? []).map((l) => l.website_url),
      ].filter((x): x is string => !!x && !/fb\.com\/messenger_doc/.test(x));
      const videos = [c.video_id, oss.video_data?.video_id, ...(c.asset_feed_spec?.videos ?? []).map((v) => v.video_id)].filter(
        (x): x is string => !!x,
      );
      const link = links.find((l) => target && linkMatches(l, target)) ?? links[0] ?? null;
      return {
        id: a.id,
        name: a.name,
        status: a.effective_status,
        link,
        videos: [...new Set(videos)],
        matched: Boolean(target && links.some((l) => linkMatches(l, target))),
      };
    })
    .sort((x, y) => Number(y.matched) - Number(x.matched) || Number(y.status === "ACTIVE") - Number(x.status === "ACTIVE"));
}

// লিংক থেকে ছোট নাম: /reckless-maroon-casual-shoes/ → "Reckless Maroon Casual Shoes"; মূল সাইট হলে ডোমেইন
export function productLabel(url: string) {
  const t = cleanUrl(url);
  if (!t) return "Product";
  if (t.whole) return t.host;
  const slug = t.path.split("/").filter(Boolean).pop() ?? t.host;
  return slug
    .replace(/\.(html?|php)$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 60);
}

const DAY = 86400;
const post = (token: string, accountId: string, params: Record<string, string>) =>
  graphRequest<{ id: string }>(`/${accountId}/customaudiences`, { method: "POST", params: { prefill: "true", ...params }, token, timeoutMs: 30_000 });

export const audienceName = (label: string, what: string, days: number) => `${HOOK_PREFIX}${label} · ${what} · ${days}d`.slice(0, 200);

// ভিডিও দর্শক: Meta এখনো পুরোনো নিয়মের ফরম্যাট চায়, আর ভিডিওগুলো পেজের পোস্টে থাকতে হয় (বিজ্ঞাপনের ভিডিও থাকে)
// পেজে যুক্ত নয় এমন ভিডিও (যেমন dynamic বিজ্ঞাপনের) থাকলে Meta পুরোটা ফেরত দেয়; সেটা বাদ দিয়ে আবার চেষ্টা
export async function createVideoAudience(token: string, accountId: string, name: string, kind: VideoKind, videoIds: string[], days: number) {
  let ids = videoIds.slice(0, 50);
  const skipped: string[] = [];
  for (;;) {
    if (ids.length === 0) throw new Error("None of these videos are linked to a Facebook page, so Meta can't make a video audience from them.");
    try {
      const res = await post(token, accountId, {
        name,
        subtype: "ENGAGEMENT",
        retention_days: String(Math.min(365, Math.max(1, days))),
        rule: JSON.stringify(ids.map((id) => ({ event_name: VIDEO_EVENTS[kind].event, object_id: id }))),
      });
      return { id: res.id, used: ids.length, skipped };
    } catch (err) {
      const bad = err instanceof Error ? err.message.match(/video (\d+)\b[^.]*isn't associated/)?.[1] : undefined;
      if (!bad || !ids.includes(bad)) throw err;
      ids = ids.filter((x) => x !== bad);
      skipped.push(bad);
    }
  }
}

// ওয়েবসাইট: Pixel-এর ইভেন্ট, লিংকে এই প্রোডাক্টের পথ থাকলে (মূল সাইট হলে পুরো সাইট)
export function createWebAudience(token: string, accountId: string, name: string, kind: WebKind, pixelId: string, productUrl: string, days: number) {
  const t = cleanUrl(productUrl);
  const ret = Math.min(180, Math.max(1, days)) * DAY;
  const rule = (event: string, withUrl: boolean) => ({
    event_sources: [{ id: pixelId, type: "pixel" }],
    retention_seconds: ret,
    filter: {
      operator: "and",
      filters: [
        { field: "event", operator: "eq", value: event },
        ...(withUrl && t && !t.whole ? [{ field: "url", operator: "i_contains", value: t.path }] : []),
        ...(withUrl && t?.whole ? [{ field: "url", operator: "i_contains", value: t.host }] : []),
      ],
    },
  });
  const w = WEB_EVENTS[kind];
  return post(token, accountId, {
    name,
    rule: JSON.stringify({
      inclusions: { operator: "or", rules: [rule(w.event, true)] },
      // কার্ট/চেকআউট/দেখা: যারা এর মধ্যে কিনে ফেলেছে তাদের বাদ
      ...(w.excludeBuyers ? { exclusions: { operator: "or", rules: [rule("Purchase", false)] } } : {}),
    }),
  });
}
