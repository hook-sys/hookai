import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, normalizeShopDomain, shopifyConfig, verifyOAuthQuery } from "@/lib/shops/shopify";

const STATE_COOKIE = "shopify_oauth_state";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hook.com.bd").replace(/\/$/, "");

// Shopify-তে অ্যাপ ইনস্টলের পর Shopify Hook-এর পাতা খোলে (shop, hmac সহ)। তখন এখান থেকে অনুমতির ধাপ শুরু হয়,
// যাতে Hook অর্ডার পড়ার টোকেন পায়। দোকানটা বেছে রাখা ক্লায়েন্টে যুক্ত হয় (callback-এ)।
export async function GET(request: NextRequest) {
  const cfg = shopifyConfig();
  const params = request.nextUrl.searchParams;
  const shop = normalizeShopDomain(params.get("shop") ?? "");
  if (!cfg || !shop || !verifyOAuthQuery(params, cfg.apiSecret)) {
    return NextResponse.redirect(`${SITE_URL}/orders?shop=denied#shops`);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE_URL}/login`);

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(shop, cfg.apiKey, `${SITE_URL}/api/shopify/callback`, state));
  res.cookies.set(STATE_COOKIE, `${state}:${shop}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/shopify",
  });
  return res;
}
