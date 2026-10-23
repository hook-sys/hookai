import type { SupabaseClient } from "@supabase/supabase-js";
import { enTr, type Tr } from "@/lib/i18n";
import { isValidDate } from "@/lib/dates";

// দোকানের অর্ডার ও তাদের অবস্থা, ক্যাম্পেইন অনুযায়ী হিসাব

export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const COURIERS = ["steadfast", "pathao", "carrybee", "redx", "paperfly", "other"] as const;
export type Courier = (typeof COURIERS)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function isCourier(value: unknown): value is Courier {
  return COURIERS.includes(value as Courier);
}

export function statusLabel(status: OrderStatus, tr: Tr = enTr) {
  const labels: Record<OrderStatus, [string, string]> = {
    pending: ["Pending", "পেন্ডিং"],
    confirmed: ["Confirmed", "কনফার্ম"],
    shipped: ["Shipped", "কুরিয়ারে"],
    delivered: ["Delivered", "ডেলিভারি"],
    cancelled: ["Cancelled", "ক্যানসেল"],
    returned: ["Returned", "রিটার্ন"],
  };
  return tr(labels[status][0], labels[status][1]);
}

export const COURIER_NAMES: Record<Courier, string> = {
  steadfast: "Steadfast",
  pathao: "Pathao",
  carrybee: "CarryBee",
  redx: "RedX",
  paperfly: "Paperfly",
  other: "Other",
};

// দোকান বা কুরিয়ার ভিন্ন ভিন্ন নামে অবস্থা লেখে; সেগুলোকে আমাদের ছয়টি অবস্থায় আনা
const STATUS_WORDS: Record<string, OrderStatus> = {
  pending: "pending",
  new: "pending",
  processing: "pending",
  "on-hold": "pending",
  "on hold": "pending",
  unconfirmed: "pending",
  "পেন্ডিং": "pending",
  "নতুন": "pending",
  confirmed: "confirmed",
  confirm: "confirmed",
  approved: "confirmed",
  "কনফার্ম": "confirmed",
  shipped: "shipped",
  "in transit": "shipped",
  in_transit: "shipped",
  "in-transit": "shipped",
  "in_review": "shipped",
  picked: "shipped",
  "picked up": "shipped",
  "on the way": "shipped",
  dispatched: "shipped",
  fulfilled: "shipped",
  "কুরিয়ারে": "shipped",
  delivered: "delivered",
  completed: "delivered",
  complete: "delivered",
  "partial_delivered": "delivered",
  "partial delivered": "delivered",
  "ডেলিভারি": "delivered",
  "ডেলিভারড": "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancel: "cancelled",
  failed: "cancelled",
  rejected: "cancelled",
  "ক্যানসেল": "cancelled",
  "বাতিল": "cancelled",
  returned: "returned",
  return: "returned",
  refunded: "returned",
  "return_received": "returned",
  "রিটার্ন": "returned",
};

export function normalizeStatus(raw: string): OrderStatus | null {
  const key = raw.trim().toLowerCase().replace(/^wc-/, "");
  return STATUS_WORDS[key] ?? null;
}

// ---------- ক্যাম্পেইনের তালিকা ও খরচ ----------

export type KnownCampaign = { id: string; name: string };

// এই Ad Account-এর যেসব ক্যাম্পেইনের ডাটা Hook-এ আছে (অর্ডারের সাথে মেলাতে)
export async function knownCampaigns(supabase: SupabaseClient, userId: string, accountId: string) {
  const { data } = await supabase
    .from("ad_insights_daily")
    .select("campaign_id, campaign_name, date")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .order("date", { ascending: false })
    .limit(5000);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    if (!map.has(r.campaign_id)) map.set(r.campaign_id, r.campaign_name ?? r.campaign_id);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

async function spendByCampaign(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: { since: string; until: string },
) {
  const { data } = await supabase
    .from("ad_insights_daily")
    .select("campaign_id, campaign_name, spend")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .gte("date", range.since)
    .lte("date", range.until)
    .limit(20000);
  const map = new Map<string, { name: string; spend: number }>();
  for (const r of data ?? []) {
    const e = map.get(r.campaign_id) ?? { name: r.campaign_name ?? r.campaign_id, spend: 0 };
    e.spend += Number(r.spend) || 0;
    map.set(r.campaign_id, e);
  }
  return map;
}

// ---------- হিসাব ----------

export type OrderRow = {
  id: string;
  external_id: string;
  order_date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  amount: number;
  status: OrderStatus;
  source: string;
  courier: Courier | null;
  tracking_code: string | null;
};

export type OutcomeCounts = {
  orders: number;
  pending: number;
  confirmed: number; // কনফার্ম হয়েছে এমন সব (পরে কুরিয়ারে, ডেলিভারি বা রিটার্ন হলেও)
  shipped: number;
  delivered: number;
  cancelled: number;
  returned: number;
  orderValue: number;
  deliveredValue: number;
};

export type CampaignOutcome = OutcomeCounts & {
  campaignId: string | null; // null = কোনো ক্যাম্পেইনের সাথে মেলেনি
  name: string;
  spend: number;
};

const emptyCounts = (): OutcomeCounts => ({
  orders: 0,
  pending: 0,
  confirmed: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
  returned: 0,
  orderValue: 0,
  deliveredValue: 0,
});

function addOrder(c: OutcomeCounts, o: OrderRow) {
  c.orders += 1;
  c.orderValue += o.amount;
  // "confirmed" গোনা হয় নিচে: কনফার্মের পরের সব ধাপও কনফার্ম হওয়া অর্ডার
  if (o.status !== "confirmed") c[o.status] += 1;
  if (["confirmed", "shipped", "delivered", "returned"].includes(o.status)) c.confirmed += 1;
  if (o.status === "delivered") c.deliveredValue += o.amount;
}

// ডেলিভারি রেট: যেসব অর্ডারের ফল জানা গেছে (ডেলিভারি, ক্যানসেল বা রিটার্ন) তার মধ্যে কয়টা ডেলিভারি
export function deliveryRate(c: OutcomeCounts) {
  const settled = c.delivered + c.cancelled + c.returned;
  return settled > 0 ? c.delivered / settled : null;
}

export async function loadOrders(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: { since: string; until: string },
) {
  const { data } = await supabase
    .from("orders")
    .select("id, external_id, order_date, campaign_id, campaign_name, amount, status, source, courier, tracking_code")
    .eq("user_id", userId)
    .eq("ad_account_id", accountId)
    .gte("order_date", range.since)
    .lte("order_date", range.until)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20000);
  return (data ?? []).map((o) => ({ ...o, amount: Number(o.amount) || 0 })) as OrderRow[];
}

// অর্ডারের তারিখ ধরে: এই সময়ে আসা অর্ডারগুলোর এখনকার অবস্থা, পাশে একই সময়ের বিজ্ঞাপন খরচ
export async function campaignOutcomes(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  range: { since: string; until: string },
  orders: OrderRow[],
  tr: Tr = enTr,
) {
  const spend = await spendByCampaign(supabase, userId, accountId, range);
  const rows = new Map<string, CampaignOutcome>();
  const keyOf = (id: string | null) => id ?? "__none__";

  for (const [id, s] of spend) {
    rows.set(id, { ...emptyCounts(), campaignId: id, name: s.name, spend: s.spend });
  }
  const total = emptyCounts();
  for (const o of orders) {
    const key = keyOf(o.campaign_id);
    let row = rows.get(key);
    if (!row) {
      row = {
        ...emptyCounts(),
        campaignId: o.campaign_id,
        name: o.campaign_id ? (o.campaign_name ?? o.campaign_id) : tr("Not linked to a campaign", "কোনো ক্যাম্পেইনের সাথে মেলেনি"),
        spend: 0,
      };
      rows.set(key, row);
    }
    addOrder(row, o);
    addOrder(total, o);
  }

  const list = [...rows.values()]
    .filter((r) => r.orders > 0 || r.spend > 0)
    .sort((a, b) => (a.campaignId === null ? 1 : b.campaignId === null ? -1 : b.orders - a.orders || b.spend - a.spend));
  const totalSpend = [...spend.values()].reduce((s, x) => s + x.spend, 0);
  return { rows: list, total: { ...total, spend: totalSpend } };
}

// ---------- CSV ----------

// সাধারণ CSV (উদ্ধৃতি চিহ্নের ভেতরে কমা ও নতুন লাইন চলে)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string[]> = {
  external_id: ["order_id", "order id", "order", "order number", "order_number", "order no", "invoice", "id", "#"],
  order_date: ["date", "order_date", "order date", "created_at", "created", "date created"],
  campaign_id: ["campaign_id", "campaign id", "utm_id"],
  campaign_name: ["campaign", "campaign_name", "campaign name", "utm_campaign"],
  amount: ["amount", "total", "order total", "price", "cod_amount", "cod amount", "value"],
  status: ["status", "order status", "delivery status"],
  courier: ["courier"],
  tracking_code: ["tracking", "tracking_code", "tracking code", "consignment_id", "consignment id", "tracking id"],
};

export const CSV_TEMPLATE =
  "order_id,date,campaign_id,campaign_name,amount,status,courier,tracking_code\n" +
  "1001,2026-10-20,120213456789012345,Winter Jacket - Broad,1850,delivered,steadfast,SF123456\n" +
  "1002,2026-10-21,,Winter Jacket - Broad,1650,cancelled,,\n";

// 20/10/2026, 2026-10-20 বা 2026-10-20T10:00 ধরনের তারিখ বোঝে
export function parseOrderDate(raw: string): string | null {
  const s = raw.trim();
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && isValidDate(iso)) return iso;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (isValidDate(d)) return d;
  }
  return null;
}

export type ParsedOrder = {
  external_id: string;
  order_date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  amount: number;
  status: OrderStatus;
  courier: Courier | null;
  tracking_code: string | null;
};

// ক্যাম্পেইন ID না থাকলে নাম দিয়ে মেলায়; utm_campaign-এ ID থাকলেও চেনে
export function matchCampaign(
  idRaw: string,
  nameRaw: string,
  campaigns: KnownCampaign[],
): { campaign_id: string | null; campaign_name: string | null } {
  const id = idRaw.trim();
  const name = nameRaw.trim();
  if (/^\d{6,30}$/.test(id)) {
    return { campaign_id: id, campaign_name: campaigns.find((c) => c.id === id)?.name ?? (name || null) };
  }
  if (/^\d{6,30}$/.test(name)) {
    return { campaign_id: name, campaign_name: campaigns.find((c) => c.id === name)?.name ?? null };
  }
  if (name) {
    const found = campaigns.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    return { campaign_id: found?.id ?? null, campaign_name: found?.name ?? name.slice(0, 300) };
  }
  return { campaign_id: null, campaign_name: null };
}

export function parseAmount(raw: string) {
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function readOrdersCsv(text: string, campaigns: KnownCampaign[], tr: Tr = enTr) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { orders: [] as ParsedOrder[], errors: [tr("The file has no order rows.", "ফাইলে কোনো অর্ডার নেই।")] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    col[field] = header.findIndex((h) => aliases.includes(h));
  }
  if (col.external_id < 0 || col.order_date < 0) {
    return {
      orders: [],
      errors: [tr("The first row must have at least order_id and date columns.", "প্রথম সারিতে অন্তত order_id আর date কলাম থাকতে হবে।")],
    };
  }

  const get = (r: string[], field: string) => (col[field] >= 0 ? (r[col[field]] ?? "").trim() : "");
  const orders = new Map<string, ParsedOrder>();
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const externalId = get(r, "external_id").slice(0, 100);
    const date = parseOrderDate(get(r, "order_date"));
    const rawStatus = get(r, "status");
    const status = rawStatus ? normalizeStatus(rawStatus) : "pending";
    if (!externalId || !date || !status) {
      if (errors.length < 10) {
        errors.push(
          !externalId
            ? tr(`Row ${line}: order_id is empty.`, `সারি ${line}: order_id খালি।`)
            : !date
              ? tr(`Row ${line}: date not understood.`, `সারি ${line}: তারিখ বোঝা যায়নি।`)
              : tr(`Row ${line}: unknown status "${rawStatus}".`, `সারি ${line}: অচেনা অবস্থা "${rawStatus}"।`),
        );
      }
      return;
    }
    const courierRaw = get(r, "courier").toLowerCase();
    const courier = courierRaw ? (isCourier(courierRaw) ? courierRaw : "other") : null;
    orders.set(externalId, {
      external_id: externalId,
      order_date: date,
      ...matchCampaign(get(r, "campaign_id"), get(r, "campaign_name"), campaigns),
      amount: parseAmount(get(r, "amount")),
      status,
      courier,
      tracking_code: get(r, "tracking_code").slice(0, 100) || null,
    });
  });
  return { orders: [...orders.values()], errors };
}

// Meta বিজ্ঞাপনের "URL parameters" ঘরে বসানোর লেখা
export const URL_PARAMETERS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.id}}";
