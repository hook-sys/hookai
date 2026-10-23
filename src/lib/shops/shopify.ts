import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrderStatus } from "@/lib/orders";
import { isCourier, type Courier } from "@/lib/orders";

// Hook-এর Shopify অ্যাপ (Shopify Dev Dashboard-এ তৈরি)। দোকানদার নিজের দোকানে অ্যাপটি ইনস্টল করে
// অনুমতি দেয় (OAuth), Hook শুধু অর্ডার পড়ে (read_orders)।
export const SHOPIFY_API_VERSION = "2026-10";
export const SHOPIFY_SCOPES = "read_orders";

export function shopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

// "my-shop", "my-shop.myshopify.com" বা "https://my-shop.myshopify.com/admin" → "my-shop.myshopify.com"
export function normalizeShopDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const domain = s.endsWith(".myshopify.com") ? s : `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// OAuth callback-এর query যাচাই: hmac বাদে বাকি সব প্যারামিটার সাজিয়ে app secret দিয়ে HMAC-SHA256
export function verifyOAuthQuery(params: URLSearchParams, secret: string) {
  const hmac = params.get("hmac") ?? "";
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return safeEqual(createHmac("sha256", secret).update(message).digest("hex"), hmac);
}

// webhook-এর X-Shopify-Hmac-Sha256: কাঁচা বডির base64 HMAC
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  return safeEqual(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), header);
}

export function authorizeUrl(shop: string, apiKey: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: apiKey, scope: SHOPIFY_SCOPES, redirect_uri: redirectUri, state });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

export async function exchangeCode(shop: string, code: string, cfg: { apiKey: string; apiSecret: string }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: cfg.apiKey, client_secret: cfg.apiSecret, code }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; scope?: string };
  if (!data.access_token) throw new Error("Shopify returned no access token");
  return { accessToken: data.access_token, scope: data.scope ?? "" };
}

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function shopifyGraphql<T>(shop: string, accessToken: string, query: string, variables: object = {}) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new ShopifyError(`Shopify ${res.status}`, res.status);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new ShopifyError(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

// ---------- অর্ডারকে আমাদের রূপে আনা ----------

export type ShopOrder = {
  external_id: string;
  order_date: string;
  updated_at: string;
  amount: number;
  status: OrderStatus;
  utmId: string;
  utmCampaign: string;
  courier: Courier | null;
  tracking_code: string | null;
};

// বিজ্ঞাপনের লিংকে বসানো utm_id (ক্যাম্পেইন ID) ও utm_campaign, ক্রেতা যে পাতায় নেমেছিল সেখান থেকে
export function utmFrom(landingPage: string | null | undefined) {
  if (!landingPage) return { utmId: "", utmCampaign: "" };
  try {
    const url = new URL(landingPage, "https://shop.invalid");
    return {
      utmId: url.searchParams.get("utm_id")?.trim() ?? "",
      utmCampaign: url.searchParams.get("utm_campaign")?.trim() ?? "",
    };
  } catch {
    return { utmId: "", utmCampaign: "" };
  }
}

const COURIER_WORDS: [RegExp, Courier][] = [
  [/steadfast|packzy/i, "steadfast"],
  [/pathao/i, "pathao"],
  [/carry\s*bee/i, "carrybee"],
  [/redx/i, "redx"],
  [/paperfly/i, "paperfly"],
];

export function courierFrom(company: string | null | undefined): Courier | null {
  if (!company) return null;
  const hit = COURIER_WORDS.find(([re]) => re.test(company));
  return hit ? hit[1] : isCourier(company.toLowerCase()) ? (company.toLowerCase() as Courier) : "other";
}

// Shopify জানে বাতিল, ফেরত টাকা আর পাঠানো হয়েছে কিনা; ডেলিভারির খবর আসে কুরিয়ার থেকে
export function shopifyStatus(o: { cancelled: boolean; financial: string; fulfillment: string }): OrderStatus {
  const financial = o.financial.toUpperCase();
  const fulfillment = o.fulfillment.toUpperCase();
  if (o.cancelled) return "cancelled";
  if (financial === "REFUNDED") return "returned";
  if (["FULFILLED", "PARTIALLY_FULFILLED", "IN_PROGRESS", "PARTIAL"].includes(fulfillment)) return "shipped";
  return "pending";
}

// "#1001" → "1001", যাতে কুরিয়ারের invoice-এ দেওয়া অর্ডার নম্বরের সাথে মেলে
export const orderNumber = (name: string) => name.replace(/^#/, "").trim().slice(0, 100);

// Dhaka সময়ে অর্ডারের তারিখ
export const dhakaDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

type GqlOrder = {
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string } } | null;
  customerJourneySummary: {
    lastVisit: { landingPage: string | null } | null;
    firstVisit: { landingPage: string | null } | null;
  } | null;
  fulfillments: { trackingInfo: { number: string | null; company: string | null }[] }[];
};

function fromGraphql(o: GqlOrder): ShopOrder {
  const journey = o.customerJourneySummary;
  // শেষ ভিজিটে UTM না থাকলে প্রথম ভিজিট দেখা হয়
  const last = utmFrom(journey?.lastVisit?.landingPage);
  const utm = last.utmId || last.utmCampaign ? last : utmFrom(journey?.firstVisit?.landingPage);
  const tracking = o.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.number);
  return {
    external_id: orderNumber(o.name),
    order_date: dhakaDate(o.createdAt),
    updated_at: o.updatedAt,
    amount: Number(o.totalPriceSet?.shopMoney.amount) || 0,
    status: shopifyStatus({
      cancelled: Boolean(o.cancelledAt),
      financial: o.displayFinancialStatus ?? "",
      fulfillment: o.displayFulfillmentStatus ?? "",
    }),
    ...utm,
    courier: courierFrom(tracking?.company),
    tracking_code: tracking?.number?.slice(0, 100) ?? null,
  };
}

const ORDERS_QUERY = `
query Orders($cursor: String, $query: String) {
  orders(first: 100, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name
      createdAt
      updatedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { shopMoney { amount } }
      customerJourneySummary {
        lastVisit { landingPage }
        firstVisit { landingPage }
      }
      fulfillments(first: 5) { trackingInfo(first: 1) { number company } }
    }
  }
}`;

// নির্দিষ্ট সময়ের পরে বদলানো অর্ডারগুলো (প্রতি পাতায় ১০০টি, সর্বোচ্চ maxPages পাতা)
export async function fetchShopifyOrders(shop: string, accessToken: string, updatedSince: string, maxPages = 20) {
  const orders: ShopOrder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlOrder[] };
    } = await shopifyGraphql(shop, accessToken, ORDERS_QUERY, { cursor, query: `updated_at:>='${updatedSince}'` });
    orders.push(...data.orders.nodes.map(fromGraphql));
    if (!data.orders.pageInfo.hasNextPage) return { orders, complete: true };
    cursor = data.orders.pageInfo.endCursor;
  }
  return { orders, complete: false };
}

// Shopify webhook (REST আকারের JSON) থেকে
export function fromWebhook(body: Record<string, unknown>): ShopOrder | null {
  const name = typeof body.name === "string" ? body.name : null;
  const createdAt = typeof body.created_at === "string" ? body.created_at : null;
  if (!name || !createdAt) return null;
  const fulfillments = Array.isArray(body.fulfillments) ? (body.fulfillments as Record<string, unknown>[]) : [];
  const tracked = fulfillments.find((f) => typeof f.tracking_number === "string" && f.tracking_number);
  return {
    external_id: orderNumber(name),
    order_date: dhakaDate(createdAt),
    updated_at: typeof body.updated_at === "string" ? body.updated_at : createdAt,
    amount: Number(body.total_price) || 0,
    status: shopifyStatus({
      cancelled: Boolean(body.cancelled_at),
      financial: String(body.financial_status ?? ""),
      fulfillment: String(body.fulfillment_status ?? ""),
    }),
    ...utmFrom(typeof body.landing_site === "string" ? body.landing_site : null),
    courier: courierFrom(typeof tracked?.tracking_company === "string" ? tracked.tracking_company : null),
    tracking_code: typeof tracked?.tracking_number === "string" ? tracked.tracking_number.slice(0, 100) : null,
  };
}

const WEBHOOK_MUTATION = `
mutation Subscribe($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

// নতুন অর্ডার ও অর্ডারের বদল সাথে সাথে Hook-এ পাঠাতে Shopify-কে বলা
export async function registerShopifyWebhooks(shop: string, accessToken: string, uri: string) {
  const errors: string[] = [];
  for (const topic of ["ORDERS_CREATE", "ORDERS_UPDATED"]) {
    const data: {
      webhookSubscriptionCreate: { userErrors: { message: string }[] };
    } = await shopifyGraphql(shop, accessToken, WEBHOOK_MUTATION, { topic, sub: { uri, format: "JSON" } });
    // একই ঠিকানা আগে থেকে থাকলে Shopify "already taken" বলে; সেটা সমস্যা নয়
    for (const e of data.webhookSubscriptionCreate.userErrors) {
      if (!/taken|exists/i.test(e.message)) errors.push(e.message);
    }
  }
  return errors;
}
