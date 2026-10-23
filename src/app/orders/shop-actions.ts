"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/plans";
import { listShops, syncShop } from "@/lib/shops";
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
  const shops = await listShops(supabase, user.id);
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
