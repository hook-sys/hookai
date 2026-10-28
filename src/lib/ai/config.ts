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
// task অনুযায়ী মডেল: "assistant" (AI সহকারী) বা "report" (রিপোর্ট, সারসংক্ষেপ, লেখা);
// সেটিং-এ আলাদা মডেল না থাকলে প্রোভাইডারের সাধারণ মডেল।
// যেকোনো লগইন-করা ব্যবহারকারীর জন্য কাজ করে (ডাটাবেস ফাংশন শুধু চালু সারিটি দেয়)।
export type AiTask = "assistant" | "report";

export async function getActiveAiConfig(
  supabase: SupabaseClient,
  task: AiTask = "report",
): Promise<AiConfig> {
  const { data, error } = await supabase.rpc("get_task_ai_config", { p_task: task }).maybeSingle<{
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
