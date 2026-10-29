"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";

async function owner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) return null;
  return { supabase, user };
}

// ক্লায়েন্টের লক্ষ্য: অর্ডারপ্রতি খরচ (খালি রাখলে লক্ষ্য মুছে যায়)
export async function setTarget(formData: FormData) {
  const ctx = await owner();
  if (!ctx) return;
  const id = String(formData.get("clientId") ?? "");
  const raw = String(formData.get("target") ?? "").replace(/[^\d.]/g, "");
  const value = raw ? Number(raw) : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (value !== null && !(value > 0 && value < 1e7))) return;
  await ctx.supabase.from("clients").update({ target_cost_per_order: value }).eq("id", id).eq("user_id", ctx.user.id);
  revalidatePath("/home");
}

// সতর্কবার্তা দেখা হয়ে গেছে: তালিকা থেকে সরে যায়
export async function dismissNotification(formData: FormData) {
  const ctx = await owner();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  // হোমে একই অ্যাকাউন্টের একই কথা একবার দেখায়, তাই সবগুলো একসাথে "দেখা হয়েছে"
  const { data: n } = await ctx.supabase.from("notifications").select("ad_account_id, title").eq("id", id).eq("user_id", ctx.user.id).maybeSingle();
  if (!n) return;
  await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("ad_account_id", n.ad_account_id)
    .eq("title", n.title)
    .is("read_at", null);
  revalidatePath("/home");
}

// "রিফ্রেশ": হোমের জমা থাকা Meta হিসাব মুছে আবার আনা
export async function refreshHome() {
  const ctx = await owner();
  if (!ctx) return;
  await ctx.supabase.from("insights_cache").delete().eq("user_id", ctx.user.id).eq("kind", "home");
  revalidatePath("/home");
}
