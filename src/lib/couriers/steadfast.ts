import { CourierError, courierFetch, type CourierStatus } from "./common";

// Steadfast (Packzy) merchant API
// ডক: https://documenter.getpostman.com/view/26211192/2sAYJ1mhpk
const BASE_URL = "https://portal.packzy.com/api/v1";

export type SteadfastCredentials = { apiKey: string; secretKey: string };

function sfGet<T>(c: SteadfastCredentials, path: string) {
  return courierFetch<T>(`${BASE_URL}${path}`, {
    headers: { "Api-Key": c.apiKey, "Secret-Key": c.secretKey, Accept: "application/json" },
  });
}

// key ঠিক আছে কিনা দেখার জন্য ব্যালেন্স চাওয়া হয় (কিছু বদলায় না)
export async function checkSteadfast(c: SteadfastCredentials) {
  const data = await sfGet<{ status?: number }>(c, "/get_balance");
  if (data.status !== 200) throw new CourierError("Steadfast rejected the keys", 401);
}

// Steadfast-এ "cancelled" মানে পার্সেল ডেলিভারি হয়নি, ফেরত আসছে; তাই আমাদের হিসাবে রিটার্ন
export function mapSteadfastStatus(raw: unknown): CourierStatus | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "delivered" || s === "partial_delivered") return "delivered";
  if (s === "cancelled" || s.startsWith("cancelled_return") || s.startsWith("partial_delivered_return")) return "returned";
  if (["in_review", "pending", "hold", "exceptional", "unknown"].includes(s) || s.endsWith("_approval_pending")) {
    return "shipped";
  }
  return null;
}

// ট্র্যাকিং ঘরে সংখ্যা থাকলে consignment ID, অক্ষর-সংখ্যা থাকলে tracking code; না থাকলে অর্ডার নম্বরকে invoice ধরা হয়
export async function steadfastStatus(
  c: SteadfastCredentials,
  order: { external_id: string; tracking_code: string | null },
): Promise<CourierStatus | null> {
  const code = order.tracking_code?.trim();
  const path =
    code && /^\d{4,20}$/.test(code)
      ? `/status_by_cid/${code}`
      : code && /^[A-Za-z0-9]{4,40}$/.test(code)
        ? `/status_by_trackingcode/${code}`
        : `/status_by_invoice/${encodeURIComponent(order.external_id)}`;
  const data = await sfGet<{ status?: number; delivery_status?: string }>(c, path);
  return data.status === 200 ? mapSteadfastStatus(data.delivery_status) : null;
}
