import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fromWooOrder, verifyWooSignature } from "@/lib/shops/woocommerce";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512 * 1024;

// WooCommerce নতুন অর্ডার বা অর্ডারের বদল এখানে পাঠায়। ঠিকানার token-ই webhook-এর Secret:
// X-WC-Webhook-Signature সেটা দিয়ে মেলানো হয়, আর ডাটাবেস token-এর hash মিলিয়ে দেখে।
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; token: string }> },
) {
  const { connectionId, token } = await params;
  if (!UUID_PATTERN.test(connectionId) || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });

  // webhook সেভ করার সময় WooCommerce একটা ছোট পরীক্ষা ("webhook_id=12") পাঠায়, স্বাক্ষর ছাড়া
  if (/^webhook_id=\d+$/.test(raw.trim())) return NextResponse.json({ ok: true });

  if (!verifyWooSignature(raw, request.headers.get("x-wc-webhook-signature"), token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const topic = request.headers.get("x-wc-webhook-topic") ?? "";
  if (!/^order\.(created|updated)$/.test(topic)) return NextResponse.json({ ok: true, ignored: true });

  let order;
  let rawStatus = "";
  try {
    const body = JSON.parse(raw);
    rawStatus = typeof body.status === "string" ? body.status : "";
    order = fromWooOrder(body);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!order) return NextResponse.json({ ok: true, ignored: true });

  // utm_id বা utm_campaign-এ সংখ্যা থাকলে সেটাই ক্যাম্পেইন ID; নাম হলে ডাটাবেস নাম দিয়ে মেলায়
  const numeric = [order.utmId, order.utmCampaign].find((v) => /^\d{6,30}$/.test(v)) ?? "";
  const { error } = await createPublicClient().rpc("shop_webhook_order", {
    p_connection_id: connectionId,
    p_token: token,
    p_external_id: order.external_id,
    p_order_date: order.order_date,
    p_amount: order.amount,
    p_status: order.status,
    p_campaign_id: numeric,
    p_campaign_name: numeric ? "" : order.utmCampaign,
    p_courier: order.courier ?? "",
    p_tracking_code: order.tracking_code ?? "",
    p_customer_hash: order.customer_hash,
    p_fbc: order.fbc ?? "",
    // দোকানের সেটিং অনুযায়ী "processing" ডাটাবেসে ঠিক হয়
    p_raw_status: rawStatus,
  });
  if (error) {
    if (error.code === "28000") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error("woocommerce webhook failed", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
