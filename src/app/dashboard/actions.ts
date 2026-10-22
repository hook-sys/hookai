"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { syncInsights } from "@/lib/insights/sync";
import { buildPeriodReport, findDataWarnings, parseRange } from "@/lib/insights/report";
import { AiError } from "@/lib/ai/providers";
import { generateAndStoreSummary, type StoredSummary } from "@/lib/ai/summary";

// "ডাটা রিফ্রেশ" বোতাম: Meta থেকে এখনই নতুন ডাটা আনে
export async function refreshInsights(formData: FormData) {
  const range = String(formData.get("range") ?? "7");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.selected_ad_account_id) redirect("/settings");

  let status = "refreshed";
  try {
    await syncInsights(
      supabase,
      user.id,
      decrypt(connection.access_token_encrypted),
      connection.selected_ad_account_id,
    );
  } catch (err) {
    console.error("insights refresh failed", err instanceof Error ? err.message : err);
    status = "refresh_error";
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?range=${encodeURIComponent(range)}&status=${status}`);
}

export type SummaryState =
  | { ok: true; summary: StoredSummary }
  | { ok: false; error: string }
  | null;

// "AI সারসংক্ষেপ" বোতাম: জমা থাকা ডাটা থেকে হিসাব করে AI-কে ব্যাখ্যা করতে দেয়
export async function generateAiSummary(
  _prev: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const range = parseRange(formData.get("range"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();

  const accountId = connection?.selected_ad_account_id;
  if (!accountId) {
    return { ok: false, error: "আগে সেটিংস থেকে একটি Ad Account বেছে নাও।" };
  }

  try {
    const report = await buildPeriodReport(supabase, user.id, accountId, range);
    const summary = await generateAndStoreSummary(
      supabase,
      user.id,
      accountId,
      report,
      {
        name: connection.selected_ad_account_name ?? accountId,
        currency: connection.selected_ad_account_currency,
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
