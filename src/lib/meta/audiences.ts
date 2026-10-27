import { graphGetAll, graphRequest } from "./graph";
import { HOOK_PREFIX, type Preset } from "./audiencePresets";

export { HOOK_PREFIX, PRESETS, PRESET_IDS, type Preset, type PresetId } from "./audiencePresets";

// রিটার্গেটিং অডিয়েন্স: ওয়েবসাইট (Pixel), পেজ এনগেজমেন্ট, ভিডিও দেখেছে, আর Lookalike।
// Hook-এর বানানো অডিয়েন্সের নাম "Hook · " দিয়ে শুরু হয়, যাতে আবার বানানোর সময় চেনা যায়।


export type Audience = {
  id: string;
  name: string;
  subtype: string;
  sizeLow: number | null;
  sizeHigh: number | null;
  ready: boolean;
  status: string | null;
  createdAt: string | null;
};

type RawAudience = {
  id: string;
  name: string;
  subtype?: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  delivery_status?: { code?: number; description?: string };
  operation_status?: { code?: number; description?: string };
  time_created?: number;
};

export async function listAudiences(token: string, accountId: string): Promise<Audience[]> {
  const rows = await graphGetAll<RawAudience>(
    `/${accountId}/customaudiences`,
    {
      fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_created",
      limit: "200",
    },
    token,
    5,
  );
  return rows
    .map((a) => ({
      id: a.id,
      name: a.name,
      subtype: a.subtype ?? "CUSTOM",
      // Meta ছোট অডিয়েন্সের সংখ্যা -1 বা ১০০০ নিচে দেখায় না
      sizeLow: a.approximate_count_lower_bound && a.approximate_count_lower_bound > 0 ? a.approximate_count_lower_bound : null,
      sizeHigh: a.approximate_count_upper_bound && a.approximate_count_upper_bound > 0 ? a.approximate_count_upper_bound : null,
      ready: a.delivery_status?.code === 200,
      status: a.delivery_status?.code === 200 ? null : (a.delivery_status?.description ?? null),
      createdAt: a.time_created ? new Date(a.time_created * 1000).toISOString() : null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// ---------- রিটার্গেটিং সেটের অডিয়েন্স ----------

const DAY = 86400;

function pixelRule(pixelId: string, event: string, days: number, excludePurchase: boolean) {
  const rule = (ev: string) => ({
    event_sources: [{ id: pixelId, type: "pixel" }],
    retention_seconds: days * DAY,
    filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: ev }] },
  });
  return {
    inclusions: { operator: "or", rules: [rule(event)] },
    ...(excludePurchase ? { exclusions: { operator: "or", rules: [rule("Purchase")] } } : {}),
  };
}

function pageRule(pageId: string, event: string, days: number) {
  return {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: pageId, type: "page" }],
          retention_seconds: days * DAY,
          filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: event }] },
        },
      ],
    },
  };
}

// চালু বিজ্ঞাপনের ভিডিও (এগুলো পেজের পোস্টের সাথে যুক্ত থাকে, তাই অডিয়েন্স বানানো যায়)
export async function activeAdVideos(token: string, accountId: string) {
  const ads = await graphGetAll<{ creative?: { video_id?: string; object_story_spec?: { video_data?: { video_id?: string } } } }>(
    `/${accountId}/ads`,
    { fields: "creative{video_id,object_story_spec}", effective_status: JSON.stringify(["ACTIVE"]), limit: "100" },
    token,
    3,
  );
  const ids = ads.map((a) => a.creative?.video_id ?? a.creative?.object_story_spec?.video_data?.video_id).filter((x): x is string => !!x);
  return [...new Set(ids)].slice(0, 50);
}

export function presetName(p: Preset, sourceLabel: string) {
  return `${HOOK_PREFIX}${p.name[0]} · ${sourceLabel}`.slice(0, 200);
}

export async function createPreset(
  token: string,
  accountId: string,
  preset: Preset,
  src: { pixelId?: string; pageId?: string; videoIds?: string[]; label: string },
) {
  const name = presetName(preset, src.label);
  const post = (params: Record<string, string>) =>
    graphRequest<{ id: string }>(`/${accountId}/customaudiences`, { method: "POST", params: { name, prefill: "true", ...params }, token, timeoutMs: 30_000 });

  switch (preset.id) {
    case "visitors_30":
      return post({ rule: JSON.stringify(pixelRule(src.pixelId!, "PageView", 30, false)) });
    case "viewcontent_14":
      return post({ rule: JSON.stringify(pixelRule(src.pixelId!, "ViewContent", 14, true)) });
    case "atc_no_purchase_14":
      return post({ rule: JSON.stringify(pixelRule(src.pixelId!, "AddToCart", 14, true)) });
    case "checkout_no_purchase_7":
      return post({ rule: JSON.stringify(pixelRule(src.pixelId!, "InitiateCheckout", 7, true)) });
    case "buyers_180":
      return post({ rule: JSON.stringify(pixelRule(src.pixelId!, "Purchase", 180, false)) });
    case "page_engaged_90":
      return post({ rule: JSON.stringify(pageRule(src.pageId!, "page_engaged", 90)) });
    case "page_messaged_180":
      return post({ rule: JSON.stringify(pageRule(src.pageId!, "page_messaged", 180)) });
    case "video_50_30":
      // ভিডিও অডিয়েন্সে Meta এখনো পুরোনো নিয়মের ফরম্যাট চায়
      return post({
        subtype: "ENGAGEMENT",
        retention_days: "30",
        rule: JSON.stringify((src.videoIds ?? []).map((id) => ({ event_name: "video_view_50_percent", object_id: id }))),
      });
  }
}

// একই রকম মানুষ খোঁজা: উৎস অডিয়েন্সে অন্তত ১০০ জন লাগে
export async function createLookalike(token: string, accountId: string, source: { id: string; name: string }, percent: number) {
  const pct = Math.min(10, Math.max(1, Math.round(percent)));
  return graphRequest<{ id: string }>(`/${accountId}/customaudiences`, {
    method: "POST",
    params: {
      name: `${HOOK_PREFIX}Lookalike ${pct}% BD · ${source.name.replace(HOOK_PREFIX, "")}`.slice(0, 200),
      subtype: "LOOKALIKE",
      origin_audience_id: source.id,
      lookalike_spec: JSON.stringify({ type: "similarity", ratio: pct / 100, country: "BD" }),
    },
    token,
    timeoutMs: 30_000,
  });
}

export async function deleteAudience(token: string, id: string) {
  return graphRequest<{ success?: boolean }>(`/${id}`, { method: "DELETE", token });
}

export async function audienceAccount(token: string, id: string) {
  return graphRequest<{ id: string; account_id?: string; name: string }>(`/${id}`, { params: { fields: "id,account_id,name" }, token });
}
