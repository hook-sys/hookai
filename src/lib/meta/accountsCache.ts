import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { getAdAccounts } from "./graph";

// উপরের মেনুর জন্য Ad Account-এর তালিকা। ৬ ঘণ্টা পর পর Meta থেকে নতুন করে আনে, মাঝে জমা থাকা তালিকা দেখায়।
const REFRESH_MS = 6 * 60 * 60 * 1000;

export type AccountOption = { id: string; name: string; active: boolean };

export async function adAccountOptions(supabase: SupabaseClient, userId: string) {
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name, ad_accounts_cache, ad_accounts_cached_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!c) return null;

  let accounts = (c.ad_accounts_cache as AccountOption[] | null) ?? null;
  const stale = !c.ad_accounts_cached_at || Date.now() - new Date(c.ad_accounts_cached_at).getTime() > REFRESH_MS;
  const expired = c.token_expires_at && new Date(c.token_expires_at) < new Date();
  if ((stale || !accounts) && !expired) {
    try {
      const fresh = await getAdAccounts(decrypt(c.access_token_encrypted));
      accounts = fresh.map((a) => ({ id: a.id, name: a.name, active: a.account_status === 1 }));
      await supabase
        .from("meta_connections")
        .update({ ad_accounts_cache: accounts, ad_accounts_cached_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch (err) {
      console.error("ad account list refresh failed", err instanceof Error ? err.message : err);
    }
  }
  return {
    accounts: accounts ?? [],
    selectedId: c.selected_ad_account_id as string | null,
    selectedName: c.selected_ad_account_name as string | null,
  };
}
