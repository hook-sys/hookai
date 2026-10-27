import { createHash } from "node:crypto";

// Conversions API: কনফার্ম আর ডেলিভারি হওয়া অর্ডার সার্ভার থেকে Meta-কে জানানো।
// ব্রাউজারের Purchase-এর সাথে দুবার গোনা এড়াতে আলাদা custom event নাম দেওয়া হয়
// (OrderConfirmed, OrderDelivered)। এগুলো দিয়ে Custom Conversion বানিয়ে আসল ক্রেতার জন্য optimize করা যায়।

export type CustomerHash = { ph?: string[]; em?: string[]; ct?: string[]; country?: string[] };

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export function normalizePhone(raw: string | null | undefined) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (/^01\d{9}$/.test(d)) d = `88${d}`; // বাংলাদেশি নম্বর
  if (/^1\d{9}$/.test(d)) d = `880${d}`; // শুরুর 0 ছাড়া লেখা
  return d.length >= 8 && d.length <= 15 ? d : null;
}

// আসল ফোন/ইমেইল কোথাও রাখা হয় না, শুধু Meta-র নিয়মে hash
export function hashCustomer(input: { phone?: string | null; email?: string | null; city?: string | null; country?: string | null }): CustomerHash | null {
  const out: CustomerHash = {};
  const ph = normalizePhone(input.phone);
  if (ph) out.ph = [sha(ph)];
  const em = String(input.email ?? "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) out.em = [sha(em)];
  const ct = String(input.city ?? "").toLowerCase().replace(/[^a-zঀ-৿]/g, "");
  if (ct) out.ct = [sha(ct)];
  const country = String(input.country ?? "bd").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
  if (country.length === 2) out.country = [sha(country)];
  return out.ph || out.em ? out : null;
}

// বিজ্ঞাপনে ক্লিক করে এলে লিংকে fbclid থাকে; Meta-র fbc ফরম্যাটে বদলানো
export function fbcFromUrl(url: string | null | undefined, atMs: number) {
  if (!url) return null;
  try {
    const u = new URL(url, "https://x.invalid");
    const id = u.searchParams.get("fbclid");
    return id ? `fb.1.${atMs}.${id}`.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export type CapiOrder = {
  id: string;
  external_id: string;
  amount: number;
  status: string;
  status_updated_at: string | null;
  created_at: string;
  customer_hash: CustomerHash | null;
  fbc: string | null;
  confirmed_sent: boolean;
  delivered_sent: boolean;
};

export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "system_generated";
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
};

export function buildEvents(
  orders: CapiOrder[],
  opts: { sendConfirmed: boolean; sendDelivered: boolean; websiteUrl: string | null; nowMs?: number },
) {
  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const events: CapiEvent[] = [];
  const confirmedIds: string[] = [];
  const deliveredIds: string[] = [];
  for (const o of orders) {
    // গ্রাহককে চেনার মতো কিছু না থাকলে Meta মেলাতে পারে না; পাঠানোর মানে নেই
    if (!o.customer_hash && !o.fbc) continue;
    const when = Math.min(now, Math.floor(new Date(o.status_updated_at ?? o.created_at).getTime() / 1000));
    if (now - when > 6.5 * 86400) continue; // Meta ৭ দিনের পুরোনো event নেয় না
    const user_data: Record<string, unknown> = { ...(o.customer_hash ?? {}) };
    if (o.fbc) user_data.fbc = o.fbc;
    const base = {
      event_time: when,
      action_source: "system_generated" as const,
      ...(opts.websiteUrl ? { event_source_url: opts.websiteUrl } : {}),
      user_data,
      custom_data: { currency: "BDT", value: Math.round(Number(o.amount) || 0), order_id: o.external_id },
    };
    if (opts.sendConfirmed && !o.confirmed_sent) {
      events.push({ ...base, event_name: "OrderConfirmed", event_id: `${o.external_id}:confirmed` });
      confirmedIds.push(o.id);
    }
    if (opts.sendDelivered && o.status === "delivered" && !o.delivered_sent) {
      events.push({ ...base, event_name: "OrderDelivered", event_id: `${o.external_id}:delivered` });
      deliveredIds.push(o.id);
    }
  }
  return { events, confirmedIds, deliveredIds };
}

export async function sendCapiEvents(token: string, pixelId: string, events: CapiEvent[], testCode?: string | null) {
  // Meta একবারে ১০০০টা পর্যন্ত নেয়
  let received = 0;
  for (let i = 0; i < events.length; i += 500) {
    const body = new URLSearchParams({ data: JSON.stringify(events.slice(i, i + 500)) });
    if (testCode) body.set("test_event_code", testCode);
    const res = await fetch(`https://graph.facebook.com/v23.0/${pixelId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(json?.error?.error_user_msg ?? json?.error?.message ?? `HTTP ${res.status}`);
    }
    received += Number(json.events_received) || 0;
  }
  return received;
}
