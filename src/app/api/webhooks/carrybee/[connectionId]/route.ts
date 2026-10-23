import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { mapEventStatus, str } from "@/lib/couriers/common";
import { applyCourierUpdate, isConnectionId, readBody } from "@/lib/couriers/webhook";

const SECRET_HEADER = "X-CB-Webhook-Integration-Header";

// CarryBee পার্সেলের ঘটনা এখানে পাঠায়, X-CB-Webhook-Integration-Header-এ CarryBee-র দেওয়া secret সহ।
// উত্তরে 202 আর একই header চায়।
export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  if (!isConnectionId(connectionId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const secret = (request.headers.get(SECRET_HEADER) ?? "").trim();
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

  // webhook যোগ করার পরীক্ষা secret ছাড়াই আসে, অথচ উত্তরে secret চায়। তাই ব্যবহারকারী Hook-এ
  // "সেটআপ" চালু করলে ১০ মিনিটের মধ্যে একবারই সেটি দেওয়া হয়।
  const isCheck = body.event === "webhook.integration" || Object.keys(body).length === 0;
  if (isCheck && !secret) {
    const { data } = await createPublicClient().rpc("carrybee_setup_secret", { p_connection_id: connectionId });
    if (typeof data !== "string" || !data) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    let plain: string;
    try {
      plain = decrypt(data);
    } catch {
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 202, headers: { [SECRET_HEADER]: plain } });
  }
  if (!secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const headers = { [SECRET_HEADER]: secret };
  if (isCheck) {
    // secret সহ পরীক্ষা: যা পাঠিয়েছে তাই ফেরত দেওয়া হয়, নতুন কিছু জানানো হয় না
    return NextResponse.json({ ok: true }, { status: 202, headers });
  }

  const status = mapEventStatus(body.event);
  if (!status) return NextResponse.json({ ok: true, ignored: true }, { status: 202, headers });

  return applyCourierUpdate({
    connectionId,
    courier: "carrybee",
    token: secret,
    consignmentId: str(body.consignment_id),
    invoice: str(body.merchant_order_id),
    status,
    okStatus: 202,
    headers,
  });
}
