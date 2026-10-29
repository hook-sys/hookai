"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { SIGNUP_OPEN } from "@/lib/site";
import type { Tr } from "@/lib/i18n";

export type AuthState = { error?: string; message?: string } | null;

// Supabase-এর ত্রুটি কোড থেকে ব্যবহারকারী-বান্ধব বার্তা।
// লগইনে "ইমেইল আছে কিনা" আলাদা করে বলা হয় না, যাতে অ্যাকাউন্ট খোঁজা না যায়।
function authErrorMessage(tr: Tr, code: string | undefined, fallback: string) {
  switch (code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return tr("Too many attempts. Please wait a little and try again.", "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।");
    case "email_address_invalid":
      return tr("That email address isn't accepted.", "ইমেইল ঠিকানাটি গ্রহণযোগ্য নয়।");
    case "weak_password":
      return tr("That password is too weak. Try a longer, less common one.", "পাসওয়ার্ড দুর্বল। আরও লম্বা ও জটিল পাসওয়ার্ড দাও।");
    case "user_already_exists":
      return tr("There's already an account with this email. Log in instead.", "এই ইমেইল দিয়ে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করো।");
    default:
      return fallback;
  }
}

// ইমেইল নিশ্চিতকরণ লিংকের ঠিকানা। env না থাকলে রিকোয়েস্টের origin ব্যবহার হয়।
async function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const origin = (await headers()).get("origin");
  if (origin) return origin;

  throw new Error("NEXT_PUBLIC_SITE_URL is not set");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const tr = await getTr();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error: authErrorMessage(
        tr,
        error.code,
        tr("Wrong email or password. Please try again.", "ইমেইল বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করো।"),
      ),
    };
  }

  redirect("/home");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const tr = await getTr();
  if (!SIGNUP_OPEN) return { error: tr("New sign-ups are closed.", "নতুন অ্যাকাউন্ট খোলা এখন বন্ধ।") };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: tr("Password must be at least 8 characters.", "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return {
      error: authErrorMessage(
        tr,
        error.code,
        tr("Couldn't create the account. Please try again.", "অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করো।"),
      ),
    };
  }

  // ইমেইল নিশ্চিতকরণ বন্ধ থাকলে Supabase সাথে সাথেই session দেয়
  if (data.session) {
    redirect("/home");
  }

  return {
    message: tr(
      "Account created. Click the link we emailed you to confirm, then log in.",
      "অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে আসা লিংকে ক্লিক করে নিশ্চিত করো, তারপর লগইন করো।",
    ),
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
