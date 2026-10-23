import { NextResponse, type NextRequest } from "next/server";
import { mapEventStatus, str } from "@/lib/couriers/common";
import { applyCourierUpdate, isConnectionId, readBody } from "@/lib/couriers/webhook";

const INTEGRATION_HEADER = "X-Pathao-Merchant-Webhook-Integration-Secret";

// Pathao পার্সেলের ঘটনা (order.picked, order.delivered ...) এখানে পাঠায়।
// X-PATHAO-Signature-এ থাকে Hook-এর দেওয়া secret। Pathao সব উত্তরে 202 আর নিজের integration header ফেরত চায়।
export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!isConnectionId(connectionId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const integration = request.headers.get(INTEGRATION_HEADER);
  const headers: Record<string, string> = integration ? { [INTEGRATION_HEADER]: integration } : {};
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

  // webhook যোগ করার সময়ের পরীক্ষা: Pathao-র নিজের পাঠানো মান ফেরত দিলেই হয়, কোনো তথ্য দেয় না
  if (body.event === "webhook_integration") {
    return NextResponse.json({ ok: true }, { status: 202, headers });
  }

  const token = (request.headers.get("x-pathao-signature") ?? "").trim();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = mapEventStatus(body.event ?? body.order_status);
  if (!status) return NextResponse.json({ ok: true, ignored: true }, { status: 202, headers });

  return applyCourierUpdate({
    connectionId,
    courier: "pathao",
    token,
    consignmentId: str(body.consignment_id),
    invoice: str(body.merchant_order_id),
    status,
    okStatus: 202,
    headers,
  });
}
