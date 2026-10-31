import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { decrypt } from "@/lib/crypto";
import { normalizePhone } from "@/lib/capi";
import { normalizeShopDomain, shopifyConfig } from "@/lib/shops/shopify";
import { codProxyKey, createCodOrder, parseCodInput, sha256, verifyProxySignature, type CodSettings } from "@/lib/shops/cod";

// দোকানের পাতা থেকে /apps/hook/cod → Shopify app proxy → এখানে।
// GET: ডেলিভারি চার্জ (ফর্মে দেখানোর জন্য)। POST: অর্ডার বানানো।
// যাচাই: Shopify-র signature (app secret দিয়ে), সময় ৫ মিনিটের ভেতরে, আর ফোন/IP প্রতি অর্ডারের সীমা।

const MAX_BODY_BYTES = 16 * 1024;
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function context(request: NextRequest, phoneHash = "", ipHash = "") {
  const cfg = shopifyConfig();
  const params = request.nextUrl.searchParams;
  if (!cfg || !verifyProxySignature(params, cfg.apiSecret)) return null;
  const ts = Number(params.get("timestamp"));
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return null;
  const shop = normalizeShopDomain(params.get("shop") ?? "");
  if (!shop) return null;
  const { data, error } = await createPublicClient().rpc("cod_connection", {
    p_key: codProxyKey(),
    p_shop: shop,
    p_phone_hash: phoneHash,
    p_ip_hash: ipHash,
  });
  if (error || !data) {
    if (error) console.error("cod connection", error.message);
    return null;
  }
  const c = data as { id: string; credentials_encrypted: string; cod_settings: CodSettings; phone_recent: number; ip_recent: number };
  return { shop, ...c };
}

export async function GET(request: NextRequest) {
  const c = await context(request);
  if (!c) return fail("not found", 404);
  return NextResponse.json({ ok: true, shipping: { dhaka: Number(c.cod_settings.dhaka), outside: Number(c.cod_settings.outside) } });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("too large", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail("bad request");
  }
  // বট ধরার লুকানো ঘর: মানুষ এটা দেখে না, তাই পূরণ করে না
  if (String(body.website ?? "").trim()) return NextResponse.json({ ok: true, order: { name: "#0", total: 0 } });

  const parsed = parseCodInput(body);
  if (!parsed.ok) return fail(parsed.error);
  const input = parsed.input;

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const phoneHash = sha256(normalizePhone(input.phone) ?? input.phone);
  const ipHash = sha256(ip || "unknown");
  const c = await context(request, phoneHash, ipHash);
  if (!c) return fail("not found", 404);
  if (c.phone_recent >= 2) return fail("এই নম্বর থেকে কিছুক্ষণ আগেই অর্ডার এসেছে। আমরা শিগগিরই কল করব।", 429);
  if (c.ip_recent >= 8) return fail("অনেকগুলো অর্ডার এসেছে, একটু পরে চেষ্টা করুন।", 429);

  try {
    const { accessToken } = JSON.parse(decrypt(c.credentials_encrypted)) as { accessToken: string };
    const r = await createCodOrder(c.shop, accessToken, c.cod_settings, input);
    if (!r.ok) return fail(r.error);
    await createPublicClient().rpc("cod_save", {
      p_key: codProxyKey(),
      p_connection_id: c.id,
      p_phone_hash: phoneHash,
      p_ip_hash: ipHash,
      p_order_name: r.order.name,
      p_amount: r.order.total,
    });
    return NextResponse.json({ ok: true, order: { name: r.order.name, total: r.order.total } });
  } catch (err) {
    console.error("cod order failed", err instanceof Error ? err.message : err);
    return fail("অর্ডার নেওয়া যায়নি, একটু পরে আবার চেষ্টা করুন বা আমাদের কল করুন।", 500);
  }
}
