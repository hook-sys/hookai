"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { AiError } from "@/lib/ai/providers";
import {
  COPY_LANGUAGES,
  OBJECTIVES,
  TONES,
  generateAdCopy,
  type StoredAdCopy,
} from "@/lib/ai/adCopy";

export type AdCopyState = { ok: true; copy: StoredAdCopy } | { ok: false; error: string } | null;

const pick = <T extends string>(list: readonly T[], value: FormDataEntryValue | null, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

export async function createAdCopy(_prev: AdCopyState, formData: FormData): Promise<AdCopyState> {
  const locale = await getLocale();
  const tr = makeTr(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const product = String(formData.get("product") ?? "").trim();
  const audience = String(formData.get("audience") ?? "").trim();
  if (product.length < 10) {
    return {
      ok: false,
      error: tr(
        "Describe the product and offer in a little more detail (at least a sentence).",
        "পণ্য আর অফার একটু বিস্তারিত লেখো (অন্তত এক বাক্য)।",
      ),
    };
  }
  if (product.length > 1500 || audience.length > 300) {
    return { ok: false, error: tr("That's too long. Keep it shorter.", "লেখা অনেক লম্বা হয়ে গেছে, একটু ছোট করো।") };
  }

  try {
    const copy = await generateAdCopy(
      supabase,
      user.id,
      {
        product,
        audience,
        objective: pick(OBJECTIVES, formData.get("objective"), "sales"),
        language: pick(COPY_LANGUAGES, formData.get("language"), locale === "bn" ? "bn" : "en"),
        tone: pick(TONES, formData.get("tone"), "friendly"),
      },
      locale,
    );
    revalidatePath("/ad-copy");
    return { ok: true, copy };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    console.error("ad copy failed", err instanceof Error ? err.message : err);
    return { ok: false, error: tr("Couldn't write the ad copy. Please try again shortly.", "অ্যাডের লেখা তৈরি করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।") };
  }
}
