"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient, currentClient } from "@/lib/clients";
import { normalizeSiteUrl, reachablePixels, sharePixelToAccount } from "@/lib/meta/assets";
import { buildEvents, sendCapiEvents, type CapiOrder } from "@/lib/capi";

export type AssetState = { ok: true; message: string } | { ok: false; error: string } | null;
export type PixelChoice = { id: string; name: string; businesses: { id: string; name: string }[] };

const ID_PATTERN = /^\d{5,25}$/;

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can change assets.", "শুধু মালিক অ্যাসেট বদলাতে পারে।") } as const;
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.selected_ad_account_id) return { error: tr("Pick an ad account first.", "আগে Ad Account বেছে নাও।") } as const;
  const scope = await accountInCurrentClient(supabase, user.id, c.selected_ad_account_id);
  if (!scope.ok) return { error: tr("Pick one of this client's ad accounts first.", "আগে এই ক্লায়েন্টের একটা Ad Account বাছো।") } as const;
  const { client } = await currentClient(supabase, user.id);
  return { tr, supabase, user, client, token: decrypt(c.access_token_encrypted), accountId: c.selected_ad_account_id as string };
}

export async function saveWebsite(_prev: AssetState, formData: FormData): Promise<AssetState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, client } = ctx;
  if (!client) return { ok: false, error: tr("Create a client first (Settings).", "আগে সেটিংস থেকে ক্লায়েন্ট বানাও।") };
  const raw = String(formData.get("website_url") ?? "");
  const url = raw.trim() ? normalizeSiteUrl(raw) : null;
  if (raw.trim() && !url) return { ok: false, error: tr("That doesn't look like a website address.", "ওয়েবসাইটের ঠিকানা ঠিক মনে হচ্ছে না।") };
  await supabase.from("clients").update({ website_url: url }).eq("id", client.id).eq("user_id", user.id);
  revalidatePath("/assets");
  return { ok: true, message: tr("Saved. Checking the site…", "সংরক্ষণ হয়েছে। সাইট যাচাই হচ্ছে…") };
}

// ব্যবহারকারীর BM-গুলোতে পাওয়া Pixel (এই অ্যাকাউন্টে যোগ করার জন্য)
export async function findPixels(): Promise<{ ok: true; pixels: PixelChoice[] } | { ok: false; error: string }> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  try {
    return { ok: true, pixels: await reachablePixels(ctx.token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "error" };
  }
}

export async function addPixel(pixelId: string, businessIds: string[]): Promise<AssetState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, token, accountId } = ctx;
  const bizIds = businessIds.filter((b) => ID_PATTERN.test(b)).slice(0, 10);
  if (!ID_PATTERN.test(pixelId) || bizIds.length === 0) return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  const res = await sharePixelToAccount(token, pixelId, accountId, bizIds);
  revalidatePath("/assets");
  if (res.ok) return { ok: true, message: tr("Pixel added to this ad account.", "Pixel এই Ad Account-এ যোগ হয়েছে।") };
  return {
    ok: false,
    error: /access to both|does not have access/i.test(res.error)
      ? tr(
          "The pixel's business doesn't have this ad account. Share the pixel with the ad account's business as a partner first (Business Settings → Datasets → Assign partner).",
          "Pixel-এর BM-এর কাছে এই Ad Account নেই। আগে Pixel-টা Ad Account-এর BM-কে partner হিসেবে শেয়ার করো (Business Settings → Datasets → Assign partner)।",
        )
      : tr(`Meta refused: ${res.error}`, `Meta গ্রহণ করেনি: ${res.error}`),
  };
}

export async function saveCapi(_prev: AssetState, formData: FormData): Promise<AssetState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, client } = ctx;
  if (!client) return { ok: false, error: tr("Create a client first (Settings).", "আগে সেটিংস থেকে ক্লায়েন্ট বানাও।") };
  const pixelId = String(formData.get("capi_pixel_id") ?? "");
  const enabled = formData.get("capi_enabled") === "on";
  if (enabled && !ID_PATTERN.test(pixelId)) return { ok: false, error: tr("Pick a pixel.", "একটা Pixel বাছো।") };
  await supabase
    .from("clients")
    .update({
      capi_pixel_id: ID_PATTERN.test(pixelId) ? pixelId : null,
      capi_enabled: enabled,
      capi_send_confirmed: formData.get("capi_send_confirmed") === "on",
      capi_send_delivered: formData.get("capi_send_delivered") === "on",
    })
    .eq("id", client.id)
    .eq("user_id", user.id);
  revalidatePath("/assets");
  return {
    ok: true,
    message: enabled
      ? tr("Saved. Confirmed and delivered orders go to Meta every hour.", "সংরক্ষণ হয়েছে। কনফার্ম আর ডেলিভারি হওয়া অর্ডার প্রতি ঘণ্টায় Meta-তে যাবে।")
      : tr("Saved (off).", "সংরক্ষণ হয়েছে (বন্ধ)।"),
  };
}

// Events Manager → Test events-এর কোড দিয়ে কয়েকটা অর্ডার পরীক্ষামূলক পাঠানো (আসল হিসাবে গোনা হয় না)
export async function testCapi(_prev: AssetState, formData: FormData): Promise<AssetState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, client, token } = ctx;
  if (!client) return { ok: false, error: tr("Create a client first (Settings).", "আগে সেটিংস থেকে ক্লায়েন্ট বানাও।") };
  const code = String(formData.get("test_code") ?? "").trim();
  if (!/^TEST\w{2,20}$/i.test(code)) return { ok: false, error: tr("Paste the test code from Events Manager (starts with TEST).", "Events Manager থেকে টেস্ট কোডটা দাও (TEST দিয়ে শুরু)।") };
  const { data: c } = await supabase.from("clients").select("capi_pixel_id, website_url").eq("id", client.id).eq("user_id", user.id).maybeSingle();
  if (!c?.capi_pixel_id) return { ok: false, error: tr("Save a pixel for Conversions API first.", "আগে Conversions API-র Pixel সংরক্ষণ করো।") };

  const { data: orders } = await supabase
    .from("orders")
    .select("id, external_id, amount, status, status_updated_at, created_at, customer_hash, fbc")
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .in("status", ["confirmed", "shipped", "delivered"])
    .not("customer_hash", "is", null)
    .order("status_updated_at", { ascending: false })
    .limit(3);
  const list = (orders ?? []).map((o) => ({ ...o, confirmed_sent: false, delivered_sent: false, status_updated_at: new Date().toISOString() })) as CapiOrder[];
  if (list.length === 0) {
    return { ok: false, error: tr("No confirmed orders with customer details yet. New orders will have them.", "ক্রেতার তথ্যসহ কনফার্ম অর্ডার এখনো নেই। নতুন অর্ডারে থাকবে।") };
  }
  const { events } = buildEvents(list, { sendConfirmed: true, sendDelivered: true, websiteUrl: c.website_url });
  try {
    const n = await sendCapiEvents(token, c.capi_pixel_id, events, code);
    return { ok: true, message: tr(`Meta received ${n} test events. Check Events Manager → Test events.`, `Meta ${n}টি টেস্ট event পেয়েছে। Events Manager → Test events-এ দেখো।`) };
  } catch (err) {
    return { ok: false, error: tr(`Meta refused: ${err instanceof Error ? err.message : "error"}`, `Meta গ্রহণ করেনি: ${err instanceof Error ? err.message : "error"}`) };
  }
}
