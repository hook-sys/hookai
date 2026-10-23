import { NextResponse, type NextRequest } from "next/server";
import { shopifyConfig, verifyWebhookHmac } from "@/lib/shops/shopify";

// Shopify-র বাধ্যতামূলক গোপনীয়তা webhook (customers/data_request, customers/redact, shop/redact)।
// Hook ক্রেতার নাম, ফোন, ঠিকানা বা ইমেইল জমা রাখে না; শুধু অর্ডার নম্বর, তারিখ, টাকা ও অবস্থা। তাই
// যাচাই করে গ্রহণ করাই যথেষ্ট। দোকানদার Hook-এ সংযোগ বিচ্ছিন্ন করলে বা অ্যাকাউন্ট মুছলে তথ্য মুছে যায়।
export async function POST(request: NextRequest) {
  const cfg = shopifyConfig();
  if (!cfg) return NextResponse.json({ error: "not configured" }, { status: 404 });
  const raw = await request.text();
  if (!verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), cfg.apiSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
