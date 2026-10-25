"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { adAccountOptions } from "@/lib/meta/accountsCache";

export type ClientFormState = { ok: true; message: string } | { ok: false; error: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const ACCOUNT = /^act_\d{1,20}$/;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ফর্মে টিক দেওয়া Ad Account গুলো (শুধু Meta-র তালিকায় থাকা)
async function chosenAccounts(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, formData: FormData) {
  const ids = formData.getAll("accounts").map(String).filter((id) => ACCOUNT.test(id));
  const menu = await adAccountOptions(supabase, userId);
  const names = new Map((menu?.accounts ?? []).map((a) => [a.id, a.name]));
  return [...new Set(ids)].filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id) ?? null }));
}

// নতুন ক্লায়েন্ট, বা আগের ক্লায়েন্টের নাম ও Ad Account বদল। অন্য ক্লায়েন্টের Ad Account টিক দিলে এখানে সরে আসে।
export async function saveClient(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const tr = await getTr();
  const { supabase, user } = await session();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: tr("Give the client a name.", "ক্লায়েন্টের নাম দাও।") };
  const accounts = await chosenAccounts(supabase, user.id, formData);

  let clientId = id;
  if (UUID.test(id)) {
    const { error } = await supabase.from("clients").update({ name }).eq("id", id).eq("user_id", user.id);
    if (error) return { ok: false, error: tr("Couldn't save. Try again.", "সেভ করা যায়নি। আবার চেষ্টা করো।") };
    // টিক তুলে দেওয়া Ad Account এই ক্লায়েন্ট থেকে বাদ
    const keep = accounts.map((a) => a.id);
    let del = supabase.from("client_ad_accounts").delete().eq("user_id", user.id).eq("client_id", id);
    if (keep.length) del = del.not("ad_account_id", "in", `(${keep.join(",")})`);
    await del;
  } else {
    const { data, error } = await supabase.from("clients").insert({ user_id: user.id, name }).select("id").single();
    if (error || !data) return { ok: false, error: tr("Couldn't create the client. Try again.", "ক্লায়েন্ট বানানো যায়নি। আবার চেষ্টা করো।") };
    clientId = data.id;
  }

  if (accounts.length) {
    const { error } = await supabase.from("client_ad_accounts").upsert(
      accounts.map((a) => ({ user_id: user.id, client_id: clientId, ad_account_id: a.id, ad_account_name: a.name })),
      { onConflict: "user_id,ad_account_id" },
    );
    if (error) return { ok: false, error: tr("Couldn't save the ad accounts. Try again.", "Ad Account সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }

  // নতুন ক্লায়েন্ট বানালে সেটাই বেছে নেওয়া হয়
  if (!UUID.test(id)) await supabase.from("meta_connections").update({ selected_client_id: clientId }).eq("user_id", user.id);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: UUID.test(id)
      ? tr(`${name} saved.`, `${name} সেভ হয়েছে।`)
      : tr(`${name} created. Now connect its website and courier on the Orders page.`, `${name} তৈরি হয়েছে। এবার Orders পাতায় এর ওয়েবসাইট আর কুরিয়ার কানেক্ট করো।`),
  };
}

// ক্লায়েন্ট মুছলে তার দোকান ও কুরিয়ার সংযোগও মুছে যায়; অর্ডারগুলো থাকে, কোনো ক্লায়েন্টে থাকে না
export async function deleteClient(formData: FormData) {
  const { supabase, user } = await session();
  const id = String(formData.get("id") ?? "");
  if (UUID.test(id)) await supabase.from("clients").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/", "layout");
  redirect("/clients?deleted=1");
}
