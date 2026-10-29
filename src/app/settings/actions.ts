"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import {
  AD_ACCOUNT_ID_PATTERN,
  getAdAccount,
  revokePermissions,
} from "@/lib/meta/graph";

// অ্যাকাউন্ট বদলালে সব পাতা (ড্যাশবোর্ড, নিয়ন্ত্রণ, অর্ডার, রিপোর্ট) নতুন করে আসে
function revalidateAppPages() {
  revalidatePath("/", "layout");
}

// Ad Account বেছে নেওয়া: শুধু সেই Ad Account গ্রহণ করা হয় যা Meta এই ব্যবহারকারীর তালিকায় দেখায়।
// অ্যাকাউন্টটা কোনো ক্লায়েন্টের হলে সেই ক্লায়েন্টও বেছে নেওয়া হয়।
async function applyAdAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  clientId?: string | null,
) {
  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!connection) return false;

  let account;
  try {
    // শুধু এই অ্যাকাউন্টটাই Meta থেকে পড়া (পুরো তালিকা আনার চেয়ে অনেক দ্রুত); পড়তে পারলেই এই ব্যবহারকারীর
    account = await getAdAccount(decrypt(connection.access_token_encrypted), accountId);
  } catch (err) {
    console.error("ad account verification failed", err instanceof Error ? err.message : err);
    return false;
  }
  if (!account) return false;

  const owner =
    clientId === undefined
      ? ((await supabase.from("client_ad_accounts").select("client_id").eq("user_id", userId).eq("ad_account_id", accountId).maybeSingle())
          .data?.client_id ?? null)
      : clientId;
  // ক্লায়েন্ট থাকলে কোনো ক্লায়েন্টে না থাকা Ad Account বাছা যায় না (আগে সেটিংসে কোনো ক্লায়েন্টে যোগ করতে হয়)
  if (!owner) {
    const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) return false;
  }
  const changed = connection.selected_ad_account_id !== accountId;

  await supabase
    .from("meta_connections")
    .update({
      selected_ad_account_id: account.id,
      selected_ad_account_name: account.name,
      selected_ad_account_currency: account.currency,
      selected_ad_account_timezone: account.timezone_name,
      ...(owner ? { selected_client_id: owner } : {}),
      // নতুন Ad Account হলে ড্যাশবোর্ড খোলার সময় নতুন করে ডাটা আনবে
      ...(changed
        ? { insights_synced_at: null, insights_today_synced_at: null, insights_synced_from: null }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return true;
}

export async function selectAdAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!AD_ACCOUNT_ID_PATTERN.test(accountId)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (await applyAdAccount(supabase, user.id, accountId)) revalidateAppPages();
}

// ক্লায়েন্ট বেছে নেওয়া। এখনকার Ad Account অন্য ক্লায়েন্টের হলে এই ক্লায়েন্টের প্রথম Ad Account-এ যায়।
export async function selectClient(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const [{ data: client }, { data: accounts }, { data: conn }] = await Promise.all([
    supabase.from("clients").select("id").eq("id", clientId).eq("user_id", user.id).maybeSingle(),
    supabase.from("client_ad_accounts").select("ad_account_id").eq("user_id", user.id).eq("client_id", clientId).order("created_at"),
    supabase.from("meta_connections").select("selected_ad_account_id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!client) return;

  const ids = (accounts ?? []).map((a) => a.ad_account_id);
  if (ids.length > 0 && !ids.includes(conn?.selected_ad_account_id ?? "")) {
    await applyAdAccount(supabase, user.id, ids[0], clientId);
  } else {
    await supabase.from("meta_connections").update({ selected_client_id: clientId }).eq("user_id", user.id);
  }
  revalidateAppPages();
}

// হোম থেকে সরাসরি কোনো ক্লায়েন্টের পাতায় যাওয়া: ক্লায়েন্ট (আর দরকার হলে নির্দিষ্ট Ad Account) বেছে সেই পাতা খোলে
const NEXT_PATHS = /^\/(dashboard|orders|manage|reports|assistant|assets|audiences|rules|launch(\/[0-9a-f-]{36})?|ad-copy|settings)$/;

export async function openClient(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return;
  const target = NEXT_PATHS.test(next) ? next : "/dashboard";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: link } = accountId
    ? await supabase.from("client_ad_accounts").select("ad_account_id").eq("user_id", user.id).eq("client_id", clientId).eq("ad_account_id", accountId).maybeSingle()
    : { data: null };
  if (link) {
    await applyAdAccount(supabase, user.id, link.ad_account_id, clientId);
    revalidateAppPages();
  } else {
    await selectClient(formData);
  }
  redirect(target);
}

export type DeleteAccountState = { error: string } | null;

// পুরো অ্যাকাউন্ট মুছে ফেলে। নিশ্চিত করতে ব্যবহারকারীকে নিজের ইমেইল লিখতে হয়।
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tr = await getTr();
  const adminError = tr(
    "A super admin account can't be deleted from the app.",
    "সুপার অ্যাডমিন অ্যাকাউন্ট অ্যাপ থেকে মোছা যায় না।",
  );

  const typed = String(formData.get("confirm_email") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) {
    return { error: tr("Type your account email exactly to confirm.", "নিশ্চিত করতে তোমার অ্যাকাউন্টের ইমেইল হুবহু লেখো।") };
  }

  // অ্যাডমিন হলে কিছু করার আগেই থামাও, নইলে Meta অনুমতি বাতিল হয়ে যেত অথচ অ্যাকাউন্ট থেকে যেত
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) {
    return { error: adminError };
  }

  // আগে Meta-তে অনুমতি বাতিল, যাতে টোকেন আর কাজ না করে
  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (connection) {
    try {
      await revokePermissions(decrypt(connection.access_token_encrypted));
    } catch (err) {
      console.error("meta revoke failed", err instanceof Error ? err.message : err);
    }
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return {
      error: error.message.includes("admin")
        ? adminError
        : tr("Couldn't delete the account. Please try again shortly.", "অ্যাকাউন্ট মোছা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।"),
    };
  }

  await supabase.auth.signOut();
  redirect("/data-deletion?done=1");
}

// Meta-তে অনুমতি বাতিল করে, তারপর সংরক্ষিত সংযোগ (টোকেনসহ) ও বিজ্ঞাপনের ডাটা মুছে দেয়
export async function disconnectMeta() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connection) {
    try {
      await revokePermissions(decrypt(connection.access_token_encrypted));
    } catch (err) {
      // টোকেন আগেই অকেজো হলেও ব্যবহারকারী যেন সংযোগ মুছতে পারে
      console.error(
        "meta revoke failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  await supabase.from("ad_insights_daily").delete().eq("user_id", user.id);
  await supabase.from("meta_connections").delete().eq("user_id", user.id);
  revalidateAppPages();
}
