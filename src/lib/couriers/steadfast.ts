import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import type { OrderStatus } from "@/lib/orders";

// Steadfast (Packzy) merchant API: পার্সেলের অবস্থা আনা
// ডক: https://documenter.getpostman.com/view/26211192/2sAYJ1mhpk
const BASE_URL = "https://portal.packzy.com/api/v1";
const TIMEOUT_MS = 10_000;

// এক বারে কতগুলো অর্ডার দেখা হবে (পেজ লোড ধীর না করতে ও API সীমার মধ্যে থাকতে)
const SYNC_BATCH = 150;
const CONCURRENCY = 5;

export type SteadfastKeys = { apiKey: string; secretKey: string };

export class SteadfastError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function sfGet<T>(keys: SteadfastKeys, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Api-Key": keys.apiKey, "Secret-Key": keys.secretKey, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new SteadfastError(`Steadfast ${res.status}`, res.status);
  return (await res.json()) as T;
}

// key ঠিক আছে কিনা দেখার জন্য ব্যালেন্স চাওয়া হয় (কোনো কিছু বদলায় না)
export async function checkSteadfastKeys(keys: SteadfastKeys) {
  const data = await sfGet<{ status?: number }>(keys, "/get_balance");
  return data.status === 200;
}

// Steadfast-এর অবস্থাকে আমাদের অবস্থায় আনা। Steadfast-এ "cancelled" মানে পার্সেল ডেলিভারি হয়নি,
// ফেরত আসছে; তাই সেটা আমাদের হিসাবে রিটার্ন। অচেনা কিছু হলে null।
export function mapSteadfastStatus(raw: unknown): Extract<OrderStatus, "shipped" | "delivered" | "returned"> | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "delivered" || s === "partial_delivered") return "delivered";
  if (s === "cancelled" || s.startsWith("cancelled_return") || s.startsWith("partial_delivered_return")) return "returned";
  if (
    ["in_review", "pending", "hold", "exceptional", "unknown"].includes(s) ||
    s.endsWith("_approval_pending")
  ) {
    return "shipped";
  }
  return null;
}

// ট্র্যাকিং ঘরে সংখ্যা থাকলে consignment ID, অক্ষর-সংখ্যা থাকলে tracking code; না থাকলে অর্ডার নম্বরকে invoice ধরা হয়
function statusPath(order: { external_id: string; tracking_code: string | null }) {
  const code = order.tracking_code?.trim();
  if (code && /^\d{4,20}$/.test(code)) return `/status_by_cid/${code}`;
  if (code && /^[A-Za-z0-9]{4,40}$/.test(code)) return `/status_by_trackingcode/${code}`;
  return `/status_by_invoice/${encodeURIComponent(order.external_id)}`;
}

export function keysFrom(row: { api_key_encrypted: string; secret_key_encrypted: string }): SteadfastKeys {
  return { apiKey: decrypt(row.api_key_encrypted), secretKey: decrypt(row.secret_key_encrypted) };
}

export type SyncResult = { checked: number; updated: number; failed: number };

// শেষ না হওয়া অর্ডারগুলোর (কনফার্ম বা কুরিয়ারে) অবস্থা Steadfast থেকে এনে আপডেট করে
export async function syncSteadfast(
  supabase: SupabaseClient,
  userId: string,
  connection: { id: string; api_key_encrypted: string; secret_key_encrypted: string },
): Promise<SyncResult> {
  const keys = keysFrom(connection);
  const { data: orders } = await supabase
    .from("orders")
    .select("id, external_id, tracking_code, status, courier")
    .eq("user_id", userId)
    .in("status", ["confirmed", "shipped"])
    .or("courier.eq.steadfast,courier.is.null")
    .order("status_updated_at", { ascending: true })
    .limit(SYNC_BATCH);

  const list = orders ?? [];
  const result: SyncResult = { checked: list.length, updated: 0, failed: 0 };
  let next = 0;
  let authFailed = false;

  async function worker() {
    while (next < list.length && !authFailed) {
      const o = list[next++];
      try {
        const data = await sfGet<{ status?: number; delivery_status?: string }>(keys, statusPath(o));
        const status = data.status === 200 ? mapSteadfastStatus(data.delivery_status) : null;
        if (!status) continue;
        if (status !== o.status || o.courier !== "steadfast") {
          await supabase
            .from("orders")
            .update({ status, courier: "steadfast", status_updated_at: new Date().toISOString() })
            .eq("id", o.id)
            .eq("user_id", userId);
          result.updated += 1;
        }
      } catch (err) {
        // ভুল key হলে বাকিগুলো চেষ্টা করে লাভ নেই
        if (err instanceof SteadfastError && (err.status === 401 || err.status === 403)) authFailed = true;
        // 404 মানে এই অর্ডার Steadfast-এ নেই; সেটা ব্যর্থতা নয়
        if (!(err instanceof SteadfastError && err.status === 404)) result.failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await supabase
    .from("courier_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("user_id", userId);
  if (authFailed) throw new SteadfastError("Steadfast rejected the API key", 401);
  return result;
}
