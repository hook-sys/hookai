"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient } from "@/lib/clients";
import { getTr } from "@/lib/i18n-server";
import { getUserPlan } from "@/lib/plans";
import {
  isCourier,
  isOrderStatus,
  knownCampaigns,
  matchCampaign,
  parseAmount,
  parseOrderDate,
  readOrdersCsv,
  type ParsedOrder,
} from "@/lib/orders";

export type OrderFormState = { ok: true; message: string } | { ok: false; error: string } | null;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 5000;

async function orderContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: connection } = await supabase
    .from("meta_connections")
    .select("selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const { client } = await currentClient(supabase, user.id);
  return { supabase, user, accountId: connection?.selected_ad_account_id ?? null, clientId: client?.id ?? null };
}

type Ctx = Awaited<ReturnType<typeof orderContext>>;

// চলতি মাসে নতুন যোগ হওয়া অর্ডার প্ল্যানের সীমা পার হচ্ছে কিনা (আগে থাকা অর্ডার আপডেট গোনা হয় না)
async function checkMonthlyLimit(ctx: Ctx, accountId: string, externalIds: string[]) {
  const tr = await getTr();
  const plan = await getUserPlan(ctx.supabase, ctx.user.id);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await ctx.supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .gte("created_at", monthStart);

  const existing = new Set<string>();
  for (let i = 0; i < externalIds.length; i += 500) {
    const { data } = await ctx.supabase
      .from("orders")
      .select("external_id")
      .eq("user_id", ctx.user.id)
      .eq("ad_account_id", accountId)
      .in("external_id", externalIds.slice(i, i + 500));
    for (const r of data ?? []) existing.add(r.external_id);
  }
  const fresh = externalIds.filter((id) => !existing.has(id)).length;
  if ((count ?? 0) + fresh > plan.ordersPerMonth) {
    return tr(
      `The ${plan.name} plan allows ${plan.ordersPerMonth} new orders per month. Upgrade to add more.`,
      `${plan.name} প্ল্যানে প্রতি মাসে ${plan.ordersPerMonth}টি নতুন অর্ডার যোগ করা যায়। আরও লাগলে প্ল্যান বাড়াও।`,
    );
  }
  return null;
}

async function saveOrders(ctx: Ctx, accountId: string, orders: ParsedOrder[], source: "manual" | "csv") {
  const now = new Date().toISOString();
  const rows = orders.map((o) => ({
    ...o,
    user_id: ctx.user.id,
    client_id: ctx.clientId,
    ad_account_id: accountId,
    source,
    status_updated_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.supabase
      .from("orders")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,ad_account_id,external_id" });
    if (error) {
      console.error("orders save failed", error.message);
      return false;
    }
  }
  return true;
}

export async function addOrder(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const ctx = await orderContext();
  if (!ctx.accountId) return { ok: false, error: tr("Pick an ad account in Settings first.", "আগে সেটিংস থেকে Ad Account বেছে নাও।") };

  const externalId = String(formData.get("external_id") ?? "").trim().slice(0, 100);
  const date = parseOrderDate(String(formData.get("order_date") ?? ""));
  const status = formData.get("status");
  const courier = formData.get("courier");
  if (!externalId) return { ok: false, error: tr("Enter the order number.", "অর্ডার নম্বর লেখো।") };
  if (!date) return { ok: false, error: tr("Pick the order date.", "অর্ডারের তারিখ বেছে নাও।") };
  if (!isOrderStatus(status)) return { ok: false, error: tr("Pick a status.", "অবস্থা বেছে নাও।") };

  const limitError = await checkMonthlyLimit(ctx, ctx.accountId, [externalId]);
  if (limitError) return { ok: false, error: limitError };

  const campaigns = await knownCampaigns(ctx.supabase, ctx.user.id, ctx.accountId);
  const order: ParsedOrder = {
    external_id: externalId,
    order_date: date,
    ...matchCampaign(String(formData.get("campaign_id") ?? ""), "", campaigns),
    amount: parseAmount(String(formData.get("amount") ?? "")),
    status,
    courier: isCourier(courier) ? courier : null,
    tracking_code: String(formData.get("tracking_code") ?? "").trim().slice(0, 100) || null,
  };
  if (!(await saveOrders(ctx, ctx.accountId, [order], "manual"))) {
    return { ok: false, error: tr("Couldn't save the order. Try again.", "অর্ডার সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }
  revalidatePath("/orders");
  return { ok: true, message: tr(`Order ${externalId} saved.`, `অর্ডার ${externalId} সেভ হয়েছে।`) };
}

export async function importOrders(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const ctx = await orderContext();
  if (!ctx.accountId) return { ok: false, error: tr("Pick an ad account in Settings first.", "আগে সেটিংস থেকে Ad Account বেছে নাও।") };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: tr("Choose a CSV file.", "একটা CSV ফাইল বেছে নাও।") };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: tr("The file is larger than 2 MB. Split it into parts.", "ফাইল ২ MB-এর বেশি। কয়েক ভাগে ভাগ করে দাও।") };

  const campaigns = await knownCampaigns(ctx.supabase, ctx.user.id, ctx.accountId);
  const { orders, errors } = readOrdersCsv(await file.text(), campaigns, tr);
  if (orders.length === 0) return { ok: false, error: errors.join(" ") || tr("No orders found in the file.", "ফাইলে কোনো অর্ডার পাওয়া যায়নি।") };
  if (orders.length > MAX_CSV_ROWS) {
    return { ok: false, error: tr(`Up to ${MAX_CSV_ROWS} orders per file.`, `একটা ফাইলে সর্বোচ্চ ${MAX_CSV_ROWS}টি অর্ডার।`) };
  }

  const limitError = await checkMonthlyLimit(ctx, ctx.accountId, orders.map((o) => o.external_id));
  if (limitError) return { ok: false, error: limitError };

  if (!(await saveOrders(ctx, ctx.accountId, orders, "csv"))) {
    return { ok: false, error: tr("Couldn't save the orders. Try again.", "অর্ডার সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }
  revalidatePath("/orders");
  const linked = orders.filter((o) => o.campaign_id).length;
  const skipped = errors.length
    ? tr(` Skipped rows: ${errors.join(" ")}`, ` বাদ পড়া সারি: ${errors.join(" ")}`)
    : "";
  return {
    ok: true,
    message:
      tr(
        `${orders.length} orders imported, ${linked} linked to a campaign.`,
        `${orders.length}টি অর্ডার এসেছে, ${linked}টি ক্যাম্পেইনের সাথে মিলেছে।`,
      ) + skipped,
  };
}

export async function updateOrderStatus(formData: FormData) {
  const ctx = await orderContext();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  if (!UUID_PATTERN.test(id) || !isOrderStatus(status)) return;
  await ctx.supabase
    .from("orders")
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.user.id);
  revalidatePath("/orders");
}

export async function deleteOrder(formData: FormData) {
  const ctx = await orderContext();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;
  await ctx.supabase.from("orders").delete().eq("id", id).eq("user_id", ctx.user.id);
  revalidatePath("/orders");
}
