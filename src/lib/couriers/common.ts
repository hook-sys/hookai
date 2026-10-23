import type { OrderStatus } from "@/lib/orders";

// সব কুরিয়ারের জন্য সাধারণ অংশ

export const COURIER_IDS = ["steadfast", "pathao", "carrybee"] as const;
export type CourierId = (typeof COURIER_IDS)[number];

export function isCourierId(value: unknown): value is CourierId {
  return COURIER_IDS.includes(value as CourierId);
}

// কুরিয়ার থেকে যে অবস্থাগুলো আসতে পারে
export type CourierStatus = Extract<OrderStatus, "shipped" | "delivered" | "returned" | "cancelled">;

export const FINAL_STATUSES: OrderStatus[] = ["delivered", "returned", "cancelled"];

export class CourierError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const isAuthError = (err: unknown) => err instanceof CourierError && (err.status === 401 || err.status === 403);
export const isNotFound = (err: unknown) => err instanceof CourierError && (err.status === 404 || err.status === 422);

export async function courierFetch<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new CourierError(`HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

// Pathao ও CarryBee-র ঘটনা/অবস্থা ("order.delivered", "Pickup_Cancelled", "In Transit") একই ধাঁচের;
// সেগুলোকে আমাদের অবস্থায় আনা। টাকা পরিশোধ বা তথ্য বদলের মতো খবর (paid, updated) অবস্থা বদলায় না, তাই null।
const DELIVERED = new Set(["delivered", "partial-delivery", "partial-delivered", "exchange", "exchanged"]);
const RETURNED = new Set(["returned", "return", "paid-return", "returned-at-sorting", "returned-in-transit", "returned-to-merchant"]);
const CANCELLED = new Set(["pickup-cancelled", "cancelled", "canceled", "pickup-cancel"]);
const SHIPPED = new Set([
  "pending",
  "created",
  "pickup-requested",
  "assigned-for-pickup",
  "pickup-failed",
  "picked",
  "picked-up",
  "at-the-sorting-hub",
  "on-the-way-to-central-warehouse",
  "at-central-warehouse",
  "in-transit",
  "received-at-last-mile-hub",
  "assigned-for-delivery",
  "delivery-on-hold",
  "on-hold",
  "hold",
  "delivery-failed",
]);

export function mapEventStatus(raw: unknown): CourierStatus | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/^order\./, "").replace(/[\s_]+/g, "-");
  if (DELIVERED.has(s)) return "delivered";
  if (RETURNED.has(s) || s.startsWith("returned-")) return "returned";
  if (CANCELLED.has(s)) return "cancelled";
  if (SHIPPED.has(s)) return "shipped";
  return null;
}

export const str = (v: unknown, max = 100) =>
  typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
