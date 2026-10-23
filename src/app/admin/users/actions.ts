"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { isPlanId } from "@/lib/plans";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// পেমেন্ট চালু হওয়ার আগ পর্যন্ত অ্যাডমিন হাতে প্ল্যান দেয়। RLS-ও অ্যাডমিন ছাড়া লিখতে দেয় না।
export async function setUserPlan(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();

  const userId = String(formData.get("userId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!UUID_PATTERN.test(userId) || !isPlanId(plan)) notFound();

  const { error } = await supabase
    .from("user_plans")
    .upsert(
      { user_id: userId, plan, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: "user_id" },
    );

  revalidatePath("/admin/users");
  redirect(`/admin/users?status=${error ? "error" : "saved"}`);
}
