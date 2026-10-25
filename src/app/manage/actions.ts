"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { clearLiveCache } from "@/lib/insights/live";
import { MetaApiError } from "@/lib/meta/graph";
import { getObject, minorFactor, setDailyBudget, setDeliveryStatus, type ManagedLevel } from "@/lib/meta/manage";

export type ManageState = { ok: true; message: string } | { ok: false; error: string } | null;

const ID_PATTERN = /^\d{5,25}$/;
// একবারে বাজেট দ্বিগুণের বেশি বাড়ানো যায় না (ভুল করে বাড়তি শূন্য দিয়ে ফেলা আটকাতে)
const MAX_INCREASE = 2;

function isLevel(v: unknown): v is ManagedLevel {
  return v === "campaign" || v === "adset" || v === "ad";
}

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // বিজ্ঞাপন বদলানো শুধু মালিক (অ্যাডমিন) পারে
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can change ads.", "শুধু মালিক বিজ্ঞাপন বদলাতে পারে।") } as const;
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.selected_ad_account_id) return { error: tr("Pick an ad account in Settings first.", "আগে সেটিংস থেকে Ad Account বেছে নাও।") } as const;
  return {
    tr,
    supabase,
    user,
    token: decrypt(c.access_token_encrypted),
    accountId: c.selected_ad_account_id as string,
    currency: c.selected_ad_account_currency as string | null,
  };
}

function metaError(err: unknown, tr: (en: string, bn: string) => string) {
  const msg = err instanceof MetaApiError ? err.message : "";
  if (/permission|ads_management|\(#200\)|\(#10\)/i.test(msg)) {
    return tr(
      "Meta didn't allow the change. Reconnect Facebook in Settings and allow managing ads.",
      "Meta পরিবর্তনের অনুমতি দেয়নি। সেটিংস থেকে Facebook আবার কানেক্ট করে বিজ্ঞাপন পরিচালনার অনুমতি দাও।",
    );
  }
  return tr(`Meta refused: ${msg || "unknown error"}`, `Meta গ্রহণ করেনি: ${msg || "অজানা সমস্যা"}`);
}

// চালু বা বন্ধ (Meta-তে ACTIVE / PAUSED)
export async function changeStatus(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, token, accountId } = ctx;

  const id = String(formData.get("id") ?? "");
  const level = formData.get("level");
  const status = formData.get("status");
  if (!ID_PATTERN.test(id) || !isLevel(level) || (status !== "ACTIVE" && status !== "PAUSED")) {
    return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  }

  let name: string | null = null;
  let old: string | null = null;
  try {
    // বদলানোর আগে Meta থেকে মিলিয়ে দেখা: জিনিসটা এই Ad Account-এরই কিনা
    const obj = await getObject(token, id);
    if (`act_${obj.account_id}` !== accountId) return { ok: false, error: tr("This belongs to another ad account.", "এটা অন্য Ad Account-এর।") };
    name = obj.name;
    old = obj.status;
    await setDeliveryStatus(token, id, status);
  } catch (err) {
    const error = metaError(err, tr);
    await supabase.from("ad_change_log").insert({
      user_id: user.id, ad_account_id: accountId, level, object_id: id, object_name: name,
      action: "status", old_value: old, new_value: status, ok: false, error: error.slice(0, 500),
    });
    return { ok: false, error };
  }

  await supabase.from("ad_change_log").insert({
    user_id: user.id, ad_account_id: accountId, level, object_id: id, object_name: name,
    action: "status", old_value: old, new_value: status,
  });
  await clearLiveCache(supabase, user.id, accountId);
  revalidatePath("/manage");
  return {
    ok: true,
    message: status === "ACTIVE" ? tr(`Turned on: ${name}`, `চালু হয়েছে: ${name}`) : tr(`Turned off: ${name}`, `বন্ধ হয়েছে: ${name}`),
  };
}

// দৈনিক বাজেট বদল (ক্যাম্পেইন বাজেট বা Ad Set বাজেট)
export async function changeDailyBudget(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, token, accountId, currency } = ctx;

  const id = String(formData.get("id") ?? "");
  const level = formData.get("level");
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^\d.]/g, ""));
  if (!ID_PATTERN.test(id) || (level !== "campaign" && level !== "adset")) return { ok: false, error: tr("Invalid request.", "ভুল অনুরোধ।") };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: tr("Enter a budget above 0.", "০-এর বেশি বাজেট লেখো।") };

  const factor = minorFactor(currency);
  let name: string | null = null;
  let oldMajor: number | null = null;
  try {
    const obj = await getObject(token, id);
    if (`act_${obj.account_id}` !== accountId) return { ok: false, error: tr("This belongs to another ad account.", "এটা অন্য Ad Account-এর।") };
    name = obj.name;
    if (!obj.daily_budget) {
      return {
        ok: false,
        error: tr("This uses a lifetime budget or no budget at this level; change it in Ads Manager.", "এখানে দৈনিক বাজেট নেই (লাইফটাইম বাজেট বা অন্য লেভেলে বাজেট); Ads Manager থেকে বদলাও।"),
      };
    }
    oldMajor = Number(obj.daily_budget) / factor;
    if (amount > oldMajor * MAX_INCREASE) {
      return {
        ok: false,
        error: tr(
          `For safety, a budget can at most double in one step (max ${(oldMajor * MAX_INCREASE).toFixed(2)}). Do it in steps.`,
          `নিরাপত্তার জন্য একবারে বাজেট সর্বোচ্চ দ্বিগুণ করা যায় (সর্বোচ্চ ${(oldMajor * MAX_INCREASE).toFixed(2)})। ধাপে ধাপে বাড়াও।`,
        ),
      };
    }
    await setDailyBudget(token, id, amount * factor);
  } catch (err) {
    const error = metaError(err, tr);
    await supabase.from("ad_change_log").insert({
      user_id: user.id, ad_account_id: accountId, level, object_id: id, object_name: name,
      action: "daily_budget", old_value: oldMajor?.toFixed(2) ?? null, new_value: amount.toFixed(2), ok: false, error: error.slice(0, 500),
    });
    return { ok: false, error };
  }

  await supabase.from("ad_change_log").insert({
    user_id: user.id, ad_account_id: accountId, level, object_id: id, object_name: name,
    action: "daily_budget", old_value: oldMajor?.toFixed(2) ?? null, new_value: amount.toFixed(2),
  });
  await clearLiveCache(supabase, user.id, accountId);
  revalidatePath("/manage");
  return {
    ok: true,
    message: tr(
      `Daily budget of ${name}: ${oldMajor?.toFixed(2)} → ${amount.toFixed(2)} ${currency ?? ""}`,
      `${name}-এর দৈনিক বাজেট: ${oldMajor?.toFixed(2)} → ${amount.toFixed(2)} ${currency ?? ""}`,
    ),
  };
}
