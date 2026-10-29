"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { currentClient } from "@/lib/clients";
import { normalizeSiteUrl } from "@/lib/meta/assets";
import { parseProfileForm } from "@/lib/clientProfile";

export type ProfileState = { ok: true; message: string } | { ok: false; error: string } | null;

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { ok: false, error: tr("Only the owner can change this.", "শুধু মালিক এটা বদলাতে পারে।") };

  const { client } = await currentClient(supabase, user.id);
  // ফর্ম খোলার পর অন্য ক্লায়েন্ট বাছা হলে ভুল ক্লায়েন্টে না লেখা
  if (!client || client.id !== String(formData.get("clientId") ?? "")) {
    return { ok: false, error: tr("The selected client changed. Reload the page.", "বাছা ক্লায়েন্ট বদলে গেছে। পাতাটা আবার খোলো।") };
  }

  const rawSite = String(formData.get("website_url") ?? "").trim();
  const site = rawSite ? normalizeSiteUrl(rawSite) : null;
  if (rawSite && !site) return { ok: false, error: tr("Check the website address.", "ওয়েবসাইটের ঠিকানা ঠিক করো।") };
  const rawTarget = String(formData.get("target") ?? "").replace(/[^\d.]/g, "");
  const target = rawTarget ? Number(rawTarget) : null;
  if (target !== null && !(target > 0 && target < 1e7)) return { ok: false, error: tr("Check the target.", "লক্ষ্য ঠিক করো।") };

  const { error } = await supabase
    .from("clients")
    .update({ profile: parseProfileForm(formData), website_url: site, target_cost_per_order: target })
    .eq("id", client.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: tr("Couldn't save. Try again.", "সংরক্ষণ হয়নি। আবার চেষ্টা করো।") };
  revalidatePath("/profile");
  revalidatePath("/launch");
  revalidatePath("/home");
  return { ok: true, message: tr(`${client.name}'s profile saved. New ads will start from it.`, `${client.name}-এর প্রোফাইল সংরক্ষণ হয়েছে। নতুন বিজ্ঞাপন এখান থেকে শুরু হবে।`) };
}
