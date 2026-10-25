import type { SupabaseClient } from "@supabase/supabase-js";

// ক্লায়েন্ট (ব্র্যান্ড): প্রতিটি ক্লায়েন্টের নিজের Ad Account, দোকান ও কুরিয়ার

export type Client = { id: string; name: string };
export type ClientAccount = { client_id: string; ad_account_id: string; ad_account_name: string | null };

export async function loadClients(supabase: SupabaseClient, userId: string) {
  const [{ data: clients }, { data: accounts }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("client_ad_accounts").select("client_id, ad_account_id, ad_account_name").eq("user_id", userId),
  ]);
  return { clients: (clients ?? []) as Client[], accounts: (accounts ?? []) as ClientAccount[] };
}

export const clientOfAccount = (accounts: ClientAccount[], accountId: string | null) =>
  accountId ? (accounts.find((a) => a.ad_account_id === accountId)?.client_id ?? null) : null;

// এখন কোন ক্লায়েন্ট বেছে রাখা: সংরক্ষিত পছন্দ, নইলে বেছে রাখা Ad Account যে ক্লায়েন্টের, নইলে প্রথম ক্লায়েন্ট
export async function currentClient(supabase: SupabaseClient, userId: string) {
  const [{ clients, accounts }, { data: conn }] = await Promise.all([
    loadClients(supabase, userId),
    supabase.from("meta_connections").select("selected_client_id, selected_ad_account_id").eq("user_id", userId).maybeSingle(),
  ]);
  const byId = new Map(clients.map((c) => [c.id, c]));
  const chosen =
    (conn?.selected_client_id && byId.get(conn.selected_client_id)) ||
    byId.get(clientOfAccount(accounts, conn?.selected_ad_account_id ?? null) ?? "") ||
    clients[0] ||
    null;
  return { client: chosen as Client | null, clients, accounts };
}
