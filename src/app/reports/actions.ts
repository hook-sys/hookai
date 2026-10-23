"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReport, getTranslation, isReportKind } from "@/lib/reports";
import { translateReport } from "@/lib/ai/translateReport";
import { normalizeLocale } from "@/lib/i18n";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readTarget(formData: FormData) {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  if (!isReportKind(kind) || !UUID_PATTERN.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { kind, id, supabase, user };
}

// রিপোর্ট মুছলেও AI ব্যবহারের হিসাব (ai_usage) থেকে যায়, তাই সীমা ফেরত আসে না
export async function deleteReport(formData: FormData) {
  const { kind, id, supabase, user } = await readTarget(formData);

  await supabase
    .from(kind === "summary" ? "ai_summaries" : "campaign_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  await supabase.from("report_translations").delete().eq("report_kind", kind).eq("report_id", id).eq("user_id", user.id);

  revalidatePath("/reports");
  redirect("/reports?deleted=1");
}

// রিপোর্ট অন্য ভাষায় দেখতে: প্রথমবার AI অনুবাদ করে জমা রাখে, পরে জমা থাকা অনুবাদই দেখায়
export async function translateReportAction(formData: FormData) {
  const { kind, id, supabase, user } = await readTarget(formData);
  const to = normalizeLocale(String(formData.get("to") ?? ""));
  const back = `/reports/${kind}/${id}?lang=${to}`;

  const report = await getReport(supabase, user.id, kind, id);
  if (!report) notFound();
  if (report.originalLocale === to || (await getTranslation(supabase, kind, id, to))) redirect(back);

  let failed = false;
  try {
    const content = await translateReport(supabase, kind, report.content, to);
    const { error } = await supabase
      .from("report_translations")
      .insert({ user_id: user.id, report_kind: kind, report_id: id, locale: to, content });
    // একই সময়ে দুইবার চাপলে দ্বিতীয়টি unique নিয়মে আটকে যায়; প্রথমটিই থাকে
    if (error && error.code !== "23505") failed = true;
  } catch (err) {
    console.error("report translation failed", err instanceof Error ? err.message : err);
    failed = true;
  }
  redirect(failed ? `${back}&error=translate` : back);
}
