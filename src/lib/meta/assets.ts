import { graphGetAll, graphRequest } from "./graph";
import { pickPurchaseValue, pickPurchases } from "@/lib/metrics";
import type { MetaAction } from "./graph";

// অ্যাসেট স্বাস্থ্য: Ad Account, Pixel (event আসছে কিনা), সাইটে কোন Pixel বসানো, পেজ-Instagram সংযোগ,
// আর Purchase-এর মূল্য ভুল মুদ্রায় যাচ্ছে কিনা। এই সেশনের Pixel ঝামেলাগুলো এক পাতায় ধরার জন্য।

export type AccountHealth = {
  name: string;
  status: number;
  currency: string | null;
  timezone: string | null;
  business: string | null;
  spendCap: number | null;
  amountSpent: number | null;
  hasFunding: boolean;
  fundingLabel: string | null;
};

export async function accountHealth(token: string, accountId: string): Promise<AccountHealth> {
  const a = await graphRequest<{
    name: string;
    account_status?: number;
    currency?: string;
    timezone_name?: string;
    business?: { name?: string };
    spend_cap?: string;
    amount_spent?: string;
    funding_source_details?: { display_string?: string };
  }>(`/${accountId}`, {
    params: { fields: "name,account_status,currency,timezone_name,business{name},spend_cap,amount_spent,funding_source_details" },
    token,
  });
  // Meta এই দুটো ছোট এককে (সেন্টে) দেয়
  const minor = (v?: string) => (v && Number(v) > 0 ? Number(v) / 100 : null);
  return {
    name: a.name,
    status: a.account_status ?? 1,
    currency: a.currency ?? null,
    timezone: a.timezone_name ?? null,
    business: a.business?.name ?? null,
    spendCap: minor(a.spend_cap),
    amountSpent: minor(a.amount_spent),
    hasFunding: Boolean(a.funding_source_details),
    fundingLabel: a.funding_source_details?.display_string ?? null,
  };
}

export type PixelHealth = {
  id: string;
  name: string;
  owner: string | null;
  lastFired: string | null;
  events: Record<string, number>; // গত ৭ দিন
  usedByActiveAdSets: number;
};

export async function accountPixels(token: string, accountId: string): Promise<PixelHealth[]> {
  const [pixels, sets] = await Promise.all([
    graphGetAll<{ id: string; name: string; last_fired_time?: string; owner_business?: { name?: string } }>(
      `/${accountId}/adspixels`,
      { fields: "id,name,last_fired_time,owner_business{name}", limit: "50" },
      token,
      2,
    ),
    graphGetAll<{ promoted_object?: { pixel_id?: string } }>(
      `/${accountId}/adsets`,
      { fields: "promoted_object", effective_status: JSON.stringify(["ACTIVE"]), limit: "200" },
      token,
      3,
    ).catch(() => []),
  ]);
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  return Promise.all(
    pixels.map(async (p) => {
      const events: Record<string, number> = {};
      try {
        const st = await graphRequest<{ data: { data: { value: string; count: number }[] }[] }>(`/${p.id}/stats`, {
          params: { aggregation: "event", start_time: String(since) },
          token,
        });
        for (const b of st.data) for (const e of b.data) events[e.value] = (events[e.value] ?? 0) + e.count;
      } catch {
        // অন্য BM-এর Pixel-এ stats পড়ার অনুমতি না-ও থাকতে পারে
      }
      return {
        id: p.id,
        name: p.name,
        owner: p.owner_business?.name ?? null,
        lastFired: p.last_fired_time ?? null,
        events,
        usedByActiveAdSets: sets.filter((s) => s.promoted_object?.pixel_id === p.id).length,
      };
    }),
  );
}

// ---------- সাইটে কোন Pixel বসানো ----------

export type SiteCheck = { url: string; ok: boolean; pixelIds: string[]; viaGtm: string[]; shopify: boolean; error?: string };

const PIXEL_INIT = /fbq\(\s*['"]init['"]\s*,\s*['"](\d{12,20})['"]/g;
const GTM_ID = /GTM-[A-Z0-9]{4,10}/g;

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).slice(0, 3_000_000);
}

export function normalizeSiteUrl(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    // নিজের নেটওয়ার্কের ঠিকানা নয়, শুধু পাবলিক সাইট
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/i.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function checkSitePixels(url: string): Promise<SiteCheck> {
  try {
    const html = await fetchText(url);
    const direct = [...html.matchAll(PIXEL_INIT)].map((m) => m[1]);
    const viaGtm: string[] = [];
    // Google Tag Manager-এর ভেতরে বসানো Pixel
    for (const gtm of [...new Set(html.match(GTM_ID) ?? [])].slice(0, 3)) {
      try {
        const js = await fetchText(`https://www.googletagmanager.com/gtm.js?id=${gtm}`);
        if (/fbevents|connect\.facebook\.net/.test(js)) {
          viaGtm.push(...[...new Set(js.match(/\b\d{15,16}\b/g) ?? [])]);
        }
      } catch {
        // GTM না পেলে বাদ
      }
    }
    // Shopify-র Facebook চ্যানেলের Pixel আলাদা sandbox-এ লোড হয়, পাতার HTML-এ থাকে না
    const shopify = /cdn\.shopify\.com|Shopify\.theme/.test(html);
    return { url, ok: true, pixelIds: [...new Set(direct)], viaGtm: [...new Set(viaGtm)].slice(0, 10), shopify };
  } catch (err) {
    return { url, ok: false, pixelIds: [], viaGtm: [], shopify: false, error: err instanceof Error ? err.message.slice(0, 120) : "error" };
  }
}

// ---------- Purchase-এর মূল্য কোন মুদ্রায় ----------

export async function purchaseValueCheck(token: string, accountId: string) {
  const rows = await graphGetAll<{ spend?: string; actions?: MetaAction[]; action_values?: MetaAction[] }>(
    `/${accountId}/insights`,
    { level: "account", date_preset: "last_30d", fields: "spend,actions,action_values" },
    token,
    1,
  );
  const r = rows[0];
  if (!r) return null;
  const purchases = pickPurchases(r.actions);
  const value = pickPurchaseValue(r.action_values);
  const spend = Number(r.spend) || 0;
  return { purchases, value, spend, avgValue: purchases > 0 ? value / purchases : null, roas: spend > 0 ? value / spend : null };
}

// ---------- পেজ আর Instagram ----------

export async function pagesWithInstagram(token: string, accountId: string) {
  const pages = await graphGetAll<{ id: string; name: string }>(`/${accountId}/promote_pages`, { fields: "id,name", limit: "50" }, token, 1);
  return Promise.all(
    pages.map(async (p) => {
      const ig = await graphRequest<{ instagram_business_account?: { id: string; username?: string } }>(`/${p.id}`, {
        params: { fields: "instagram_business_account{id,username}" },
        token,
      }).catch(() => ({}) as { instagram_business_account?: { id: string; username?: string } });
      return { id: p.id, name: p.name, instagram: ig.instagram_business_account?.username ?? (ig.instagram_business_account ? "linked" : null) };
    }),
  );
}

// ---------- Ad Account-এ Pixel যোগ ----------

// ব্যবহারকারীর BM-গুলোতে যত Pixel আছে (নিজের বা partner হিসেবে পাওয়া)
export async function reachablePixels(token: string) {
  const bms = await graphGetAll<{ id: string; name: string }>("/me/businesses", { fields: "id,name", limit: "100" }, token, 2);
  const found = new Map<string, { id: string; name: string; businesses: { id: string; name: string }[] }>();
  await Promise.all(
    bms.map(async (b) => {
      for (const edge of ["owned_pixels", "client_pixels"]) {
        const list = await graphGetAll<{ id: string; name: string }>(`/${b.id}/${edge}`, { fields: "id,name", limit: "100" }, token, 2).catch(() => []);
        for (const p of list) {
          const e = found.get(p.id) ?? { id: p.id, name: p.name, businesses: [] };
          if (!e.businesses.some((x) => x.id === b.id)) e.businesses.push({ id: b.id, name: b.name });
          found.set(p.id, e);
        }
      }
    }),
  );
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// যে BM-এর কাছে Pixel আর Ad Account দুটোই আছে, তার হয়ে যোগ করতে হয়; একে একে চেষ্টা করা হয়
export async function sharePixelToAccount(token: string, pixelId: string, accountId: string, businessIds: string[]) {
  const errors: string[] = [];
  for (const biz of businessIds) {
    try {
      await graphRequest(`/${pixelId}/shared_accounts`, {
        method: "POST",
        params: { account_id: accountId.replace(/^act_/, ""), business: biz },
        token,
      });
      return { ok: true as const };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "error");
    }
  }
  return { ok: false as const, error: errors[errors.length - 1] ?? "no business" };
}
