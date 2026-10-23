import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import {
  AI_PROVIDERS,
  AiError,
  isAiProvider,
  type AiConfig,
  type AiProvider,
} from "./providers";

export async function isCurrentUserAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

// নির্দিষ্ট প্রোভাইডারের সংরক্ষিত কী ও মডেল (কী ডিক্রিপ্ট করে)। RLS-এর কারণে শুধু অ্যাডমিন পায়।
export async function getProviderConfig(
  supabase: SupabaseClient,
  provider: AiProvider,
): Promise<AiConfig> {
  const { data } = await supabase
    .from("ai_provider_configs")
    .select("api_key_encrypted, model")
    .eq("provider", provider)
    .maybeSingle();

  if (!data?.api_key_encrypted) {
    throw new AiError(`No API key is set for ${AI_PROVIDERS[provider].label}.`);
  }
  return {
    provider,
    model: data.model || AI_PROVIDERS[provider].defaultModel,
    apiKey: decrypt(data.api_key_encrypted),
  };
}

// সুপার অ্যাডমিন যে প্রোভাইডার চালু রেখেছে সেটির কনফিগ।
// যেকোনো লগইন-করা ব্যবহারকারীর জন্য কাজ করে (ডাটাবেস ফাংশন শুধু চালু সারিটি দেয়)।
export async function getActiveAiConfig(
  supabase: SupabaseClient,
): Promise<AiConfig> {
  const { data, error } = await supabase.rpc("get_active_ai_config").maybeSingle<{
    provider: string;
    model: string | null;
    api_key_encrypted: string;
  }>();

  if (error || !data || !isAiProvider(data.provider)) {
    throw new AiError("AI is not switched on yet. Ask the super admin to activate an AI provider.");
  }
  return {
    provider: data.provider,
    model: data.model || AI_PROVIDERS[data.provider].defaultModel,
    apiKey: decrypt(data.api_key_encrypted),
  };
}
