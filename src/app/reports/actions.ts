"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isReportKind } from "@/lib/reports";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// রিপোর্ট মুছলেও AI ব্যবহারের হিসাব (ai_usage) থেকে যায়, তাই সীমা ফেরত আসে না
export async function deleteReport(formData: FormData) {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  if (!isReportKind(kind) || !UUID_PATTERN.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from(kind === "summary" ? "ai_summaries" : "campaign_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/reports");
  redirect("/reports?deleted=1");
}
