"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { syncRecent } from "@/lib/insights/sync";
import { clearLiveCache } from "@/lib/insights/live";
import { buildPeriodReport, findDataWarnings } from "@/lib/insights/report";
import { isValidDate, minAllowedDate, rangeQuery, resolveRange, todayIn } from "@/lib/dates";
import { AiError } from "@/lib/ai/providers";
import { generateAndStoreSummary, type StoredSummary } from "@/lib/ai/summary";

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" && v ? v : undefined;
};

// "রিফ্রেশ" বোতাম: Meta থেকে এখনই নতুন ডাটা আনে, তারপর একই তারিখে ফিরে যায়
export async function refreshInsights(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select(
      "access_token_encrypted, selected_ad_account_id, selected_ad_account_timezone, insights_synced_from",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.selected_ad_account_id) redirect("/settings");

  const range = resolveRange(
    {
      preset: field(formData, "preset"),
      since: field(formData, "since"),
      until: field(formData, "until"),
    },
    todayIn(connection.selected_ad_account_timezone),
  );

  let status = "refreshed";
  try {
    await clearLiveCache(supabase, user.id, connection.selected_ad_account_id);
    await syncRecent(
      {
        supabase,
        userId: user.id,
        token: decrypt(connection.access_token_encrypted),
        accountId: connection.selected_ad_account_id,
      },
      connection.insights_synced_from,
    );
  } catch (err) {
    console.error("insights refresh failed", err instanceof Error ? err.message : err);
    status = "refresh_error";
  }

  // বর্তমান ভিউ ও ব্রেকডাউন ঠিক রেখে ফিরে যায় (শুধু চেনা মান)
  const keep = new URLSearchParams();
  const view = field(formData, "view");
  const bd = field(formData, "bd");
  if (view && /^[a-z]{1,20}$/.test(view)) keep.set("view", view);
  if (bd && /^[a-z_]{1,20}$/.test(bd)) keep.set("bd", bd);
  const extra = keep.toString();

  revalidatePath("/dashboard");
  redirect(`/dashboard?${rangeQuery(range)}${extra ? `&${extra}` : ""}&status=${status}`);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "দেখেছি" বোতাম: অ্যালার্টটি তালিকা থেকে সরিয়ে দেয় (RLS নিশ্চিত করে শুধু নিজের অ্যালার্ট)
export async function dismissAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
}

export type SummaryState =
  | { ok: true; summary: StoredSummary }
  | { ok: false; error: string }
  | null;

// "AI সারসংক্ষেপ" বোতাম: ড্যাশবোর্ডে দেখানো একই তারিখের হিসাব AI-কে ব্যাখ্যা করতে দেয়
export async function generateAiSummary(
  _prev: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select(
      "selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, selected_ad_account_timezone, insights_synced_from",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const accountId = connection?.selected_ad_account_id;
  if (!accountId) {
    return { ok: false, error: "আগে সেটিংস থেকে একটি Ad Account বেছে নাও।" };
  }

  const today = todayIn(connection.selected_ad_account_timezone);
  const since = field(formData, "since");
  const until = field(formData, "until");
  if (
    !since ||
    !until ||
    !isValidDate(since) ||
    !isValidDate(until) ||
    since > until ||
    until > today ||
    since < minAllowedDate(today)
  ) {
    return { ok: false, error: "তারিখ সঠিক নয়। পেজ রিফ্রেশ করে আবার চেষ্টা করো।" };
  }

  try {
    const report = await buildPeriodReport(
      supabase,
      user.id,
      accountId,
      { since, until },
      { compare: field(formData, "compare") === "1", dataFrom: connection.insights_synced_from },
    );
    const summary = await generateAndStoreSummary(
      supabase,
      user.id,
      accountId,
      report,
      {
        name: connection.selected_ad_account_name ?? accountId,
        currency: connection.selected_ad_account_currency,
        today,
      },
      {
        current: findDataWarnings(report.current),
        previous: report.previous ? findDataWarnings(report.previous) : [],
      },
    );
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    console.error("ai summary failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "সারসংক্ষেপ তৈরি করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।" };
  }
}
