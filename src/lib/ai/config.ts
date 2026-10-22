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
    throw new AiError(`${AI_PROVIDERS[provider].label}-এর API key সেট করা নেই।`);
  }
  return {
    provider,
    model: data.model || AI_PROVIDERS[provider].defaultModel,
    apiKey: decrypt(data.api_key_encrypted),
  };
}

// সুপার অ্যাডমিন যে প্রোভাইডার চালু রেখেছে সেটির কনফিগ
export async function getActiveAiConfig(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("ai_settings")
    .select("active_provider")
    .eq("id", 1)
    .maybeSingle();

  const provider = data?.active_provider;
  if (!provider || !isAiProvider(provider)) {
    throw new AiError("কোনো AI প্রোভাইডার চালু করা নেই। সুপার অ্যাডমিন পেজ থেকে বেছে নাও।");
  }
  return getProviderConfig(supabase, provider);
}
