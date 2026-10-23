import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { mapSteadfastStatus } from "@/lib/couriers/steadfast";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64 * 1024;

// Steadfast পার্সেলের অবস্থা বদলালে এখানে খবর পাঠায় (প্রতিটি ব্যবহারকারীর আলাদা ঠিকানা ও token)।
// token যাচাই আর অর্ডার আপডেট ডাটাবেসের steadfast_webhook ফাংশনে হয়।
export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!UUID_PATTERN.test(connectionId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // শুধু ডেলিভারির অবস্থার খবর কাজে লাগে; বাকিগুলো গ্রহণ করে বাদ দেওয়া হয়
  const type = body.notification_type ?? "delivery_status";
  const status = mapSteadfastStatus(body.status ?? body.delivery_status);
  if (type !== "delivery_status" || !status) return NextResponse.json({ ok: true, ignored: true });

  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 100) : "");
  const { data, error } = await createPublicClient().rpc("steadfast_webhook", {
    p_connection_id: connectionId,
    p_token: token,
    p_consignment_id: str(body.consignment_id),
    p_invoice: str(body.invoice),
    p_status: status,
  });
  if (error) {
    if (error.code === "28000") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error("steadfast webhook failed", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: data ?? 0 });
}
