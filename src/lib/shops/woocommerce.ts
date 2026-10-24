import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { normalizeStatus, type OrderStatus } from "@/lib/orders";
import { courierFrom, dhakaDate, orderNumber, type ShopOrder } from "./shopify";

// WooCommerce (WordPress) REST API v3। দোকানদার WooCommerce → Settings → Advanced → REST API-তে
// "Read" অনুমতির key বানিয়ে দেয়; Hook শুধু অর্ডার পড়ে।

export type WooCredentials = { consumerKey: string; consumerSecret: string; webhookToken: string };

// "https://shop.com/", "shop.com" → "shop.com"; সাব-ফোল্ডারে ওয়ার্ডপ্রেস থাকলে "shop.com/store"।
// শুধু সাধারণ পাবলিক ঠিকানা: IP, localhost বা ভেতরের নেটওয়ার্কের নাম নয়।
export function normalizeWooSite(input: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.port || url.username || url.password) return null;
  if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(host)) return null;
  const path = url.pathname.replace(/\/(wp-admin|wp-json).*$/i, "").replace(/\/+$/, "");
  if (!/^(\/[\w\-.~]+)*$/.test(path)) return null;
  return `${host}${path}`;
}

const apiBase = (site: string) => `https://${site}/wp-json/wc/v3`;

export class WooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// সাধারণত Basic auth; কিছু হোস্ট Authorization header মুছে দেয়, তখন HTTPS-এ query দিয়ে key পাঠানো হয়
async function wooGet<T>(site: string, c: Pick<WooCredentials, "consumerKey" | "consumerSecret">, path: string, query: Record<string, string>) {
  const attempt = async (viaQuery: boolean) => {
    const q = new URLSearchParams(query);
    if (viaQuery) {
      q.set("consumer_key", c.consumerKey);
      q.set("consumer_secret", c.consumerSecret);
    }
    const res = await fetch(`${apiBase(site)}${path}?${q}`, {
      headers: {
        Accept: "application/json",
        ...(viaQuery ? {} : { Authorization: `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64")}` }),
      },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    return res;
  };
  let res = await attempt(false);
  if (res.status === 401) res = await attempt(true);
  if (!res.ok) throw new WooError(`WooCommerce ${res.status}`, res.status);
  const text = await res.text();
  try {
    return { data: JSON.parse(text) as T, totalPages: Number(res.headers.get("x-wp-totalpages")) || 1 };
  } catch {
    throw new WooError("WooCommerce returned something that isn't JSON (is the REST API on?)");
  }
}

// key ঠিক আছে কিনা: একটা অর্ডার চেয়ে দেখা (কিছু বদলায় না)
export async function checkWoo(site: string, c: Pick<WooCredentials, "consumerKey" | "consumerSecret">) {
  const { data } = await wooGet<unknown>(site, c, "/orders", { per_page: "1" });
  if (!Array.isArray(data)) throw new WooError("Unexpected WooCommerce response");
}

type WooMeta = { key?: string; value?: unknown };
type WooOrder = {
  number?: string | number;
  id?: number;
  status?: string;
  total?: string;
  date_created_gmt?: string;
  date_modified_gmt?: string;
  meta_data?: WooMeta[];
};

const ATTR = "_wc_order_attribution_";

// WooCommerce-এর নিজের order attribution (utm_id, utm_campaign, ক্রেতা যে পাতায় নেমেছিল) থেকে ক্যাম্পেইন
// processingStatus: দোকানে "Processing" মানে নতুন অর্ডার (pending) নাকি কনফার্ম (confirmed)
export function fromWooOrder(o: WooOrder, processingStatus: OrderStatus = "pending"): ShopOrder | null {
  const number = o.number ?? o.id;
  if (number === undefined || !o.date_created_gmt) return null;
  const meta = new Map<string, string>();
  for (const m of o.meta_data ?? []) {
    if (typeof m.key === "string" && (typeof m.value === "string" || typeof m.value === "number")) meta.set(m.key, String(m.value));
  }
  let utmId = meta.get(`${ATTR}utm_id`) ?? "";
  let utmCampaign = meta.get(`${ATTR}utm_campaign`) ?? "";
  // পুরনো সংস্করণে utm_id আলাদা থাকে না; তখন ক্রেতার প্রথম পাতার লিংক থেকে
  const entry = meta.get(`${ATTR}session_entry`);
  if (entry && (!utmId || !utmCampaign)) {
    try {
      const url = new URL(entry, "https://shop.invalid");
      utmId ||= url.searchParams.get("utm_id") ?? "";
      utmCampaign ||= url.searchParams.get("utm_campaign") ?? "";
    } catch {
      // অচেনা লিংক
    }
  }
  if (utmCampaign === "(none)") utmCampaign = "";
  const gmt = (s: string) => (s.endsWith("Z") ? s : `${s}Z`);
  const tracking = meta.get("_tracking_number") ?? meta.get("tracking_number") ?? null;
  return {
    external_id: orderNumber(String(number)),
    order_date: dhakaDate(gmt(o.date_created_gmt)),
    updated_at: gmt(o.date_modified_gmt ?? o.date_created_gmt),
    amount: Number(o.total) || 0,
    // processing/on-hold = নতুন, completed = ডেলিভারি, refunded = রিটার্ন; নিজের বানানো অবস্থাও চেনে
    status: /^(wc-)?processing$/i.test(o.status ?? "") ? processingStatus : (normalizeStatus(o.status ?? "") ?? "pending"),
    utmId: utmId.trim(),
    utmCampaign: utmCampaign.trim(),
    courier: courierFrom(meta.get("_tracking_provider") ?? meta.get("tracking_provider")),
    tracking_code: tracking ? tracking.slice(0, 100) : null,
  };
}

// নির্দিষ্ট সময়ের পরে বদলানো অর্ডার (প্রতি পাতায় ১০০টি, সর্বোচ্চ maxPages পাতা), পুরনো থেকে নতুন
export async function fetchWooOrders(
  site: string,
  c: WooCredentials,
  modifiedAfter: string,
  processingStatus: OrderStatus = "pending",
  maxPages = 20,
) {
  const orders: ShopOrder[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, totalPages } = await wooGet<WooOrder[]>(site, c, "/orders", {
      per_page: "100",
      page: String(page),
      modified_after: modifiedAfter.replace(/\.\d+Z$/, "").replace(/Z$/, ""),
      dates_are_gmt: "true",
      orderby: "modified",
      order: "asc",
    });
    for (const o of Array.isArray(data) ? data : []) {
      const mapped = fromWooOrder(o, processingStatus);
      if (mapped) orders.push(mapped);
    }
    if (page >= totalPages) return { orders, complete: true };
  }
  return { orders, complete: false };
}

// WooCommerce webhook-এর X-WC-Webhook-Signature: কাঁচা বডির base64 HMAC-SHA256, secret দিয়ে
export function verifyWooSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
