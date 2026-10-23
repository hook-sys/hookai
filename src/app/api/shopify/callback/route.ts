import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { getUserPlan } from "@/lib/plans";
import { SHOP_COLUMNS, syncShop, type ShopConnection } from "@/lib/shops";
import { exchangeCode, normalizeShopDomain, registerShopifyWebhooks, shopifyConfig, verifyOAuthQuery } from "@/lib/shops/shopify";

// প্রথম সিঙ্কে ৬০ দিনের অর্ডার আসে, তাই একটু সময় লাগতে পারে
export const maxDuration = 120;

const STATE_COOKIE = "shopify_oauth_state";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hook.com.bd").replace(/\/$/, "");

// Shopify অনুমতি দেওয়ার পর এখানে ফেরায়: যাচাই, টোকেন নেওয়া, সংযোগ সেভ, webhook চালু, প্রথম সিঙ্ক
export async function GET(request: NextRequest) {
  const back = (status: string) => {
    const res = NextResponse.redirect(`${SITE_URL}/orders?shop=${status}#shops`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/shopify" });
    return res;
  };

  const cfg = shopifyConfig();
  if (!cfg) return back("unavailable");
  const params = request.nextUrl.searchParams;
  const shop = normalizeShopDomain(params.get("shop") ?? "");
  const code = params.get("code");
  const [state, stateShop] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split(":");
  if (!shop || !code || !state || params.get("state") !== state || stateShop !== shop || !verifyOAuthQuery(params, cfg.apiSecret)) {
    return back("denied");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${SITE_URL}/login`);
  const plan = await getUserPlan(supabase, user.id);
  if (!plan.courierSync) return back("plan");

  const { data: meta } = await supabase
    .from("meta_connections")
    .select("selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meta?.selected_ad_account_id) return back("no_account");

  let accessToken: string;
  try {
    ({ accessToken } = await exchangeCode(shop, code, cfg));
  } catch (err) {
    console.error("shopify exchange failed", err instanceof Error ? err.message : err);
    return back("error");
  }

  // আবার কানেক্ট করলে webhook token একই থাকে, যাতে আগের webhook ঠিকানা কাজ করে
  const { data: existing } = await supabase
    .from("shop_connections")
    .select(SHOP_COLUMNS)
    .eq("user_id", user.id)
    .eq("platform", "shopify")
    .eq("shop_domain", shop)
    .maybeSingle();
  let webhookToken = randomBytes(32).toString("hex");
  if (existing) {
    try {
      webhookToken = (JSON.parse(decrypt(existing.credentials_encrypted)) as { webhookToken?: string }).webhookToken ?? webhookToken;
    } catch {
      // পুরনো তথ্য পড়া না গেলে নতুন token
    }
  }
  const fields = {
    credentials_encrypted: encrypt(JSON.stringify({ accessToken, webhookToken })),
    webhook_token_hash: createHash("sha256").update(webhookToken).digest("hex"),
    ad_account_id: meta.selected_ad_account_id,
  };
  const saved = existing
    ? await supabase.from("shop_connections").update(fields).eq("id", existing.id).eq("user_id", user.id).select(SHOP_COLUMNS).single()
    : await supabase
        .from("shop_connections")
        .insert({ ...fields, user_id: user.id, platform: "shopify", shop_domain: shop })
        .select(SHOP_COLUMNS)
        .single();
  if (saved.error || !saved.data) {
    console.error("shopify save failed", saved.error?.message);
    return back("error");
  }
  const connection = saved.data as ShopConnection;

  try {
    const errors = await registerShopifyWebhooks(shop, accessToken, `${SITE_URL}/api/webhooks/shopify/${connection.id}/${webhookToken}`);
    if (errors.length) console.error("shopify webhook registration", errors.join("; "));
  } catch (err) {
    console.error("shopify webhook registration failed", err instanceof Error ? err.message : err);
  }

  try {
    await syncShop(supabase, user.id, connection, plan);
  } catch (err) {
    console.error("shopify first sync failed", err instanceof Error ? err.message : err);
    return back("connected_sync_error");
  }
  return back("connected");
}
