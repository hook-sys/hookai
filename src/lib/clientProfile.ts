import type { SupabaseClient } from "@supabase/supabase-js";
import { SALES_CTAS, type Gender, type LaunchObjective, type LaunchSpec } from "@/lib/meta/launch";

// ক্লায়েন্ট প্রোফাইল: একবার লিখে রাখা সাধারণ মান, নতুন বিজ্ঞাপনে নিজে থেকে বসে।
// নির্দেশনায় আলাদা কিছু বললে সেটাই মানা হয়; না বললে প্রোফাইলের মান।

export type ClientProfile = {
  objective?: LaunchObjective;
  page_id?: string;
  page_name?: string;
  pixel_id?: string;
  daily_budget?: number;
  locations?: LaunchSpec["locations"];
  age_min?: number;
  age_max?: number;
  gender?: Gender;
  interests?: LaunchSpec["interests"];
  exclude_buyers?: boolean; // নতুন ক্রেতা চাই: আগের ক্রেতাদের বাদ
  cta?: string;
  language?: "bn" | "en";
  about?: string; // ব্যবসার তথ্য: কী বিক্রি করে, দাম, ডেলিভারি, অফার, ফোন, লেখার ধরন
};

export type ClientWithProfile = {
  id: string;
  name: string;
  website_url: string | null;
  target_cost_per_order: number | null;
  profile: ClientProfile;
};

const ID = /^\d{5,25}$/;

export async function loadClientProfile(supabase: SupabaseClient, userId: string, clientId: string): Promise<ClientWithProfile | null> {
  const { data } = await supabase
    .from("clients")
    .select("id, name, website_url, target_cost_per_order, profile")
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    target_cost_per_order: data.target_cost_per_order === null ? null : Number(data.target_cost_per_order),
    profile: (data.profile ?? {}) as ClientProfile,
  };
}

// ফর্ম থেকে আসা প্রোফাইল যাচাই করে পরিষ্কার করা
export function parseProfileForm(formData: FormData): ClientProfile {
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const num = (k: string) => {
    const n = Number(text(k, 20).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const age = (k: string) => {
    const n = Math.round(Number(text(k, 3)));
    return Number.isFinite(n) && n >= 18 && n <= 65 ? n : undefined;
  };
  const json = <T,>(k: string): T[] => {
    try {
      const v = JSON.parse(String(formData.get(k) ?? "[]"));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  const locations = json<{ key: string; name: string; type: string }>("locations")
    .filter((l) => typeof l.key === "string" && /^[\w-]{1,30}$/.test(l.key) && ["country", "region", "city"].includes(l.type))
    .slice(0, 25)
    .map((l) => ({ key: l.key, name: String(l.name).slice(0, 120), type: l.type as "country" | "region" | "city" }));
  const interests = json<{ id: string; name: string }>("interests")
    .filter((i) => ID.test(String(i.id)))
    .slice(0, 25)
    .map((i) => ({ id: String(i.id), name: String(i.name).slice(0, 120) }));

  const ageMin = age("age_min");
  const ageMax = age("age_max");
  const gender = text("gender", 10);
  const cta = text("cta", 30);
  const pageId = text("page_id", 30);
  const pixelId = text("pixel_id", 30);

  const p: ClientProfile = {
    objective: formData.get("objective") === "messages" ? "messages" : "sales",
    page_id: ID.test(pageId) ? pageId : undefined,
    page_name: ID.test(pageId) ? text("page_name", 120) || undefined : undefined,
    pixel_id: ID.test(pixelId) ? pixelId : undefined,
    daily_budget: num("daily_budget"),
    locations: locations.length ? locations : undefined,
    age_min: ageMin,
    age_max: ageMin && ageMax && ageMax < ageMin ? ageMin : ageMax,
    gender: gender === "male" || gender === "female" || gender === "all" ? gender : undefined,
    interests: interests.length ? interests : undefined,
    exclude_buyers: formData.get("exclude_buyers") === "on",
    cta: (SALES_CTAS as readonly string[]).includes(cta) ? cta : undefined,
    language: formData.get("language") === "en" ? "en" : "bn",
    about: text("about", 3000) || undefined,
  };
  // undefined মানগুলো বাদ দিয়ে রাখা
  return JSON.parse(JSON.stringify(p));
}
