"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getProviderConfig, isCurrentUserAdmin } from "@/lib/ai/config";
import { AiError, generateText, isAiProvider } from "@/lib/ai/providers";

// মডেলের নামে শুধু সাধারণ অক্ষর (যেমন anthropic/claude-opus-5.5, gpt-5-mini)
const MODEL_PATTERN = /^[A-Za-z0-9._:/@-]{1,100}$/;

// প্রতিটি action নিজে অ্যাডমিন যাচাই করে; পেজ লুকানো থাকলেও action সরাসরি ডাকা যায়
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();
  return { supabase, user };
}

function readProvider(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  if (!isAiProvider(provider)) notFound();
  return provider;
}

function done(status: string, provider: string): never {
  revalidatePath("/admin/ai");
  redirect(`/admin/ai?status=${status}&provider=${provider}`);
}

// কী ও মডেল সংরক্ষণ। কী-এর ঘর খালি রাখলে আগের কী বদলায় না।
export async function saveProviderConfig(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const provider = readProvider(formData);
  const model = String(formData.get("model") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (model && !MODEL_PATTERN.test(model)) done("bad_model", provider);
  if (apiKey.length > 500) done("bad_key", provider);

  const { error } = await supabase.from("ai_provider_configs").upsert(
    {
      provider,
      model: model || null,
      ...(apiKey ? { api_key_encrypted: encrypt(apiKey) } : {}),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "provider" },
  );
  if (error) done("error", provider);

  done("saved", provider);
}

// এই প্রোভাইডারকে চালু করে; অ্যাপের সব AI কাজ এখন থেকে এটি দিয়ে হবে
export async function activateProvider(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const provider = readProvider(formData);

  const { data } = await supabase
    .from("ai_provider_configs")
    .select("api_key_encrypted")
    .eq("provider", provider)
    .maybeSingle();
  if (!data?.api_key_encrypted) done("no_key", provider);

  const { error } = await supabase
    .from("ai_settings")
    .update({
      active_provider: provider,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", 1);
  if (error) done("error", provider);

  done("activated", provider);
}

// কী মুছে দেয়; এটি চালু থাকলে চালু প্রোভাইডারও খালি হয়ে যায়
export async function removeProviderKey(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const provider = readProvider(formData);
  const now = new Date().toISOString();

  await supabase
    .from("ai_provider_configs")
    .update({ api_key_encrypted: null, updated_at: now, updated_by: user.id })
    .eq("provider", provider);

  await supabase
    .from("ai_settings")
    .update({ active_provider: null, updated_at: now, updated_by: user.id })
    .eq("id", 1)
    .eq("active_provider", provider);

  done("removed", provider);
}

export type TestState = { ok: boolean; message: string } | null;

// ছোট একটি প্রশ্ন পাঠিয়ে দেখে কী ও মডেল কাজ করছে কিনা
export async function testProvider(
  _prev: TestState,
  formData: FormData,
): Promise<TestState> {
  const { supabase } = await requireAdmin();
  const provider = readProvider(formData);

  try {
    const cfg = await getProviderConfig(supabase, provider);
    const text = await generateText(cfg, {
      system: "You are a connectivity check. Answer in one short sentence.",
      prompt: "Say in one sentence that you are working.",
      maxTokens: 1000,
    });
    return { ok: true, message: `${cfg.model}: ${text.trim().slice(0, 300)}` };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, message: err.message };
    console.error("ai test failed", err instanceof Error ? err.message : err);
    return { ok: false, message: "Test failed. Check the server logs." };
  }
}
