import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { CourierId, CourierStatus } from "./common";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64 * 1024;

export const isConnectionId = (id: string) => UUID_PATTERN.test(id);

// কুরিয়ারের পাঠানো JSON পড়া; খালি বডি হলে {} (CarryBee-র সেটআপ পরীক্ষা খালিও আসতে পারে)
export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if (!text.trim()) return {};
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// secret যাচাই ও অর্ডার আপডেট ডাটাবেসের courier_webhook ফাংশনে হয়
export async function applyCourierUpdate(input: {
  connectionId: string;
  courier: CourierId;
  token: string;
  consignmentId: string;
  invoice: string;
  status: CourierStatus;
  okStatus?: number;
  headers?: Record<string, string>;
}) {
  if (!input.token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await createPublicClient().rpc("courier_webhook", {
    p_connection_id: input.connectionId,
    p_courier: input.courier,
    p_token: input.token,
    p_consignment_id: input.consignmentId,
    p_invoice: input.invoice,
    p_status: input.status,
  });
  if (error) {
    if (error.code === "28000") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error(`${input.courier} webhook failed`, error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: data ?? 0 }, { status: input.okStatus ?? 200, headers: input.headers });
}
