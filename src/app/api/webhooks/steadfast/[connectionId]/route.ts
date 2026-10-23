import { NextResponse, type NextRequest } from "next/server";
import { str } from "@/lib/couriers/common";
import { mapSteadfastStatus } from "@/lib/couriers/steadfast";
import { applyCourierUpdate, isConnectionId, readBody } from "@/lib/couriers/webhook";

// Steadfast পার্সেলের অবস্থা বদলালে এখানে খবর পাঠায়: Authorization: Bearer <Hook-এর দেওয়া token>
export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!isConnectionId(connectionId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

  // শুধু ডেলিভারির অবস্থার খবর কাজে লাগে; বাকিগুলো গ্রহণ করে বাদ দেওয়া হয়
  const type = body.notification_type ?? "delivery_status";
  const status = mapSteadfastStatus(body.status ?? body.delivery_status);
  if (type !== "delivery_status" || !status) return NextResponse.json({ ok: true, ignored: true });

  return applyCourierUpdate({
    connectionId,
    courier: "steadfast",
    token,
    consignmentId: str(body.consignment_id),
    invoice: str(body.invoice),
    status,
  });
}
