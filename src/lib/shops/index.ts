import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { knownCampaigns, matchCampaign, type OrderStatus } from "@/lib/orders";
import type { Plan } from "@/lib/plans";
import { fetchShopifyOrders } from "./shopify";

export type ShopConnection = {
  id: string;
  platform: "shopify";
  shop_domain: string;
  ad_account_id: string;
  credentials_encrypted: string;
  last_synced_at: string | null;
  last_webhook_at: string | null;
};

export const SHOP_COLUMNS = "id, platform, shop_domain, ad_account_id, credentials_encrypted, last_synced_at, last_webhook_at";

export async function listShops(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("shop_connections").select(SHOP_COLUMNS).eq("user_id", userId);
  return (data ?? []) as ShopConnection[];
}

// প্রথমবার কতদিন আগের অর্ডার আনা হবে (Shopify read_orders দিয়ে ৬০ দিনের বেশি পুরনো অর্ডার দেয় না)
const FIRST_SYNC_DAYS = 60;

const RANK: Record<OrderStatus, number> = { pending: 0, confirmed: 1, shipped: 2, delivered: 3, cancelled: 3, returned: 3 };

export type ShopSyncResult = { fetched: number; added: number; updated: number; skippedByLimit: number; complete: boolean };

// দোকানের নতুন বা বদলানো অর্ডার এনে Hook-এ যোগ বা আপডেট করে।
// অবস্থা কখনো পেছনে যায় না (যেমন কুরিয়ারের "ডেলিভারি"-কে দোকানের "পাঠানো" বদলায় না)।
export async function syncShop(
  supabase: SupabaseClient,
  userId: string,
  shop: ShopConnection,
  plan: Plan,
): Promise<ShopSyncResult> {
  const { accessToken } = JSON.parse(decrypt(shop.credentials_encrypted)) as { accessToken: string };
  // শেষ সিঙ্কের ৫ মিনিট আগে থেকে, যাতে মাঝামাঝি সময়ের বদল বাদ না পড়ে
  const since = shop.last_synced_at
    ? new Date(new Date(shop.last_synced_at).getTime() - 5 * 60 * 1000).toISOString()
    : new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const startedAt = new Date().toISOString();

  const { orders, complete } = await fetchShopifyOrders(shop.shop_domain, accessToken, since);
  const result: ShopSyncResult = { fetched: orders.length, added: 0, updated: 0, skippedByLimit: 0, complete };

  if (orders.length > 0) {
    const campaigns = await knownCampaigns(supabase, userId, shop.ad_account_id);
    const existing = new Map<string, { status: OrderStatus; campaign_id: string | null; campaign_name: string | null; courier: string | null; tracking_code: string | null; status_updated_at: string }>();
    const ids = [...new Set(orders.map((o) => o.external_id))];
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase
        .from("orders")
        .select("external_id, status, campaign_id, campaign_name, courier, tracking_code, status_updated_at")
        .eq("user_id", userId)
        .eq("ad_account_id", shop.ad_account_id)
        .in("external_id", ids.slice(i, i + 300));
      for (const r of data ?? []) existing.set(r.external_id, r);
    }

    // প্ল্যানের মাসিক সীমা: নতুন অর্ডার যতটুকু জায়গা আছে ততটুকুই যোগ হয়
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart);
    let room = Math.max(plan.ordersPerMonth - (count ?? 0), 0);

    const rows = [];
    for (const o of orders) {
      const old = existing.get(o.external_id);
      if (!old) {
        if (room <= 0) {
          result.skippedByLimit += 1;
          continue;
        }
        room -= 1;
      }
      const campaign = matchCampaign(o.utmId, o.utmCampaign, campaigns);
      const advance = !old || RANK[o.status] > RANK[old.status];
      rows.push({
        user_id: userId,
        ad_account_id: shop.ad_account_id,
        external_id: o.external_id,
        order_date: o.order_date,
        amount: o.amount,
        source: "shopify",
        status: advance ? o.status : old!.status,
        status_updated_at: advance ? startedAt : old!.status_updated_at,
        campaign_id: old?.campaign_id ?? campaign.campaign_id,
        campaign_name: old?.campaign_name ?? campaign.campaign_name,
        courier: old?.courier ?? o.courier,
        tracking_code: old?.tracking_code ?? o.tracking_code,
      });
      if (old) result.updated += advance ? 1 : 0;
      else result.added += 1;
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("orders")
        .upsert(rows.slice(i, i + 500), { onConflict: "user_id,ad_account_id,external_id" });
      if (error) throw new Error(`orders save failed: ${error.message}`);
    }
  }

  // সব পাতা আনা গেলে এখনকার সময় থেকে পরের বার; না গেলে শেষ আনা অর্ডারের সময় থেকে
  const cursor = complete || orders.length === 0 ? startedAt : orders[orders.length - 1].updated_at;
  await supabase
    .from("shop_connections")
    .update({ last_synced_at: cursor })
    .eq("id", shop.id)
    .eq("user_id", userId);
  return result;
}
