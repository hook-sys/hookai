"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/plans";
import { decrypt, encrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { currentClient } from "@/lib/clients";
import { SHOP_COLUMNS, listShops, syncShop, type ShopConnection } from "@/lib/shops";
import { WooError, checkWoo, normalizeWooSite, type WooCredentials } from "@/lib/shops/woocommerce";
import type { OrderFormState } from "./actions";
import { authorizeUrl, normalizeShopDomain, shopifyConfig } from "@/lib/shops/shopify";

const SHOPIFY_STATE_COOKIE = "shopify_oauth_state";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hook.com.bd").replace(/\/$/, "");

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// দোকানের ঠিকানা নিয়ে Shopify-র অনুমতির পাতায় পাঠায়
export async function startShopifyConnect(formData: FormData) {
  const { supabase, user } = await session();
  const cfg = shopifyConfig();
  const shop = normalizeShopDomain(String(formData.get("shop") ?? ""));
  if (!cfg) redirect("/orders?shop=unavailable#shops");
  if (!shop) redirect("/orders?shop=bad_domain#shops");

  const plan = await getUserPlan(supabase, user.id);
  if (!plan.courierSync) redirect("/orders?shop=plan#shops");

  const state = randomBytes(24).toString("hex");
  (await cookies()).set(SHOPIFY_STATE_COOKIE, `${state}:${shop}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/shopify",
  });
  redirect(authorizeUrl(shop, cfg.apiKey, `${SITE_URL}/api/shopify/callback`, state));
}

export async function syncShopsNow(formData: FormData) {
  const { supabase, user } = await session();
  const back = String(formData.get("back") ?? "/orders");
  const safeBack = back.startsWith("/orders") ? back.split("#")[0] : "/orders";
  const join = safeBack.includes("?") ? "&" : "?";

  const plan = await getUserPlan(supabase, user.id);
  const { client } = await currentClient(supabase, user.id);
  const shops = await listShops(supabase, user.id, client?.id);
  if (shops.length === 0 || !plan.courierSync) redirect(`${safeBack}${join}shop=missing#shops`);

  let query = "";
  let added = 0;
  let updated = 0;
  let limited = 0;
  try {
    for (const shop of shops) {
      const r = await syncShop(supabase, user.id, shop, plan);
      added += r.added;
      updated += r.updated;
      limited += r.skippedByLimit;
    }
    query = `shop=synced&added=${added}&updated=${updated}${limited ? `&limited=${limited}` : ""}`;
  } catch (err) {
    console.error("shop sync failed", err instanceof Error ? err.message : err);
    query = "shop=error";
  }
  revalidatePath("/orders");
  redirect(`${safeBack}${join}${query}#shops`);
}

// সংযোগ মুছে ফেলে। Shopify-তে অ্যাপটি দোকানদার নিজে আনইনস্টল করতে পারে।
export async function disconnectShop(formData: FormData) {
  const { supabase, user } = await session();
  const id = String(formData.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    await supabase.from("shop_connections").delete().eq("id", id).eq("user_id", user.id);
  }
  revalidatePath("/orders");
  redirect("/orders?shop=disconnected#shops");
}

// WooCommerce: দোকানের ঠিকানা আর Read অনুমতির REST API key নিয়ে মিলিয়ে দেখে, সেভ করে, প্রথম সিঙ্ক করে
export async function connectWooCommerce(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const { supabase, user } = await session();
  const plan = await getUserPlan(supabase, user.id);
  if (!plan.courierSync) {
    return { ok: false, error: tr(`Store connections aren't included in the ${plan.name} plan.`, `${plan.name} প্ল্যানে দোকানের সংযোগ নেই।`) };
  }
  const site = normalizeWooSite(String(formData.get("site") ?? ""));
  const consumerKey = String(formData.get("consumer_key") ?? "").trim();
  const consumerSecret = String(formData.get("consumer_secret") ?? "").trim();
  if (!site) return { ok: false, error: tr("Enter your website address, like myshop.com.", "ওয়েবসাইটের ঠিকানা লেখো, যেমন myshop.com।") };
  if (!/^ck_[a-f0-9]{20,64}$/i.test(consumerKey) || !/^cs_[a-f0-9]{20,64}$/i.test(consumerSecret)) {
    return { ok: false, error: tr("Paste the Consumer key (ck_…) and Consumer secret (cs_…).", "Consumer key (ck_…) আর Consumer secret (cs_…) বসাও।") };
  }

  const { data: meta } = await supabase.from("meta_connections").select("selected_ad_account_id").eq("user_id", user.id).maybeSingle();
  if (!meta?.selected_ad_account_id) return { ok: false, error: tr("Pick an ad account in Settings first.", "আগে সেটিংস থেকে Ad Account বেছে নাও।") };
  const { client } = await currentClient(supabase, user.id);
  if (!client) return { ok: false, error: tr("Create a client first (Clients page).", "আগে একটা ক্লায়েন্ট বানাও (ক্লায়েন্ট পাতা)।") };

  try {
    await checkWoo(site, { consumerKey, consumerSecret });
  } catch (err) {
    const status = err instanceof WooError ? err.status : undefined;
    console.error("woocommerce check failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      error:
        status === 401 || status === 403
          ? tr("WooCommerce didn't accept these keys. Check they have Read permission.", "WooCommerce এই key গ্রহণ করেনি। key-তে Read অনুমতি আছে কিনা দেখো।")
          : tr(
              "Couldn't reach the WooCommerce REST API on this site. Check the address and that the site uses https.",
              "এই সাইটে WooCommerce REST API-তে পৌঁছানো যায়নি। ঠিকানা ঠিক আছে কিনা আর সাইট https কিনা দেখো।",
            ),
    };
  }

  // আবার কানেক্ট করলে webhook secret একই থাকে, যাতে WooCommerce-এ বসানো webhook কাজ করে
  const { data: existing } = await supabase
    .from("shop_connections")
    .select(SHOP_COLUMNS)
    .eq("user_id", user.id)
    .eq("platform", "woocommerce")
    .eq("shop_domain", site)
    .maybeSingle();
  let webhookToken = randomBytes(32).toString("hex");
  if (existing) {
    try {
      webhookToken = (JSON.parse(decrypt(existing.credentials_encrypted)) as WooCredentials).webhookToken || webhookToken;
    } catch {
      // পুরনো তথ্য পড়া না গেলে নতুন secret
    }
  }
  const fields = {
    credentials_encrypted: encrypt(JSON.stringify({ consumerKey, consumerSecret, webhookToken } satisfies WooCredentials)),
    webhook_token_hash: createHash("sha256").update(webhookToken).digest("hex"),
    ad_account_id: meta.selected_ad_account_id,
    client_id: client.id,
  };
  const saved = existing
    ? await supabase.from("shop_connections").update(fields).eq("id", existing.id).eq("user_id", user.id).select(SHOP_COLUMNS).single()
    : await supabase
        .from("shop_connections")
        .insert({ ...fields, user_id: user.id, platform: "woocommerce", shop_domain: site })
        .select(SHOP_COLUMNS)
        .single();
  if (saved.error || !saved.data) {
    console.error("woocommerce save failed", saved.error?.message);
    return { ok: false, error: tr("Couldn't save the connection. Try again.", "সংযোগ সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }

  revalidatePath("/orders");
  try {
    const r = await syncShop(supabase, user.id, saved.data as ShopConnection, plan);
    return {
      ok: true,
      message: tr(
        `WooCommerce connected: ${r.added} orders from the last 60 days imported. Now add the webhooks below for live updates.`,
        `WooCommerce কানেক্ট হয়েছে: গত ৬০ দিনের ${r.added}টি অর্ডার এসেছে। লাইভ আপডেটের জন্য এবার নিচের webhook বসাও।`,
      ),
    };
  } catch (err) {
    console.error("woocommerce first sync failed", err instanceof Error ? err.message : err);
    return {
      ok: true,
      message: tr("WooCommerce connected, but the first import didn't finish. Press Sync now.", "WooCommerce কানেক্ট হয়েছে, কিন্তু প্রথম অর্ডার আনা শেষ হয়নি। Sync now চাপো।"),
    };
  }
}

// WooCommerce-এর "Processing" মানে কী, সেটা বদলালে গত ৬০ দিনের অর্ডার আবার পড়ে অবস্থা ঠিক করা হয়
export async function setWooProcessing(formData: FormData) {
  const { supabase, user } = await session();
  const id = String(formData.get("id") ?? "");
  const value = formData.get("processing_status");
  if (!/^[0-9a-f-]{36}$/i.test(id) || (value !== "pending" && value !== "confirmed")) redirect("/orders#shops");

  const { data: shop } = await supabase
    .from("shop_connections")
    .update({ processing_status: value, last_synced_at: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("platform", "woocommerce")
    .select(SHOP_COLUMNS)
    .single();
  if (!shop) redirect("/orders?shop=error#shops");

  let query: string;
  try {
    const r = await syncShop(supabase, user.id, shop as ShopConnection, await getUserPlan(supabase, user.id));
    query = `shop=synced&added=${r.added}&updated=${r.updated}`;
  } catch (err) {
    console.error("woocommerce resync failed", err instanceof Error ? err.message : err);
    query = "shop=error";
  }
  revalidatePath("/orders");
  redirect(`/orders?${query}#shops`);
}
