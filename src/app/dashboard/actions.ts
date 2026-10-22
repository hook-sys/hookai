"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { syncInsights } from "@/lib/insights/sync";

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
