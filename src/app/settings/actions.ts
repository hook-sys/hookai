"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import {
  AD_ACCOUNT_ID_PATTERN,
  getAdAccounts,
  revokePermissions,
} from "@/lib/meta/graph";

// অ্যাকাউন্ট বদলালে সব পাতা (ড্যাশবোর্ড, নিয়ন্ত্রণ, অর্ডার, রিপোর্ট) নতুন করে আসে
function revalidateAppPages() {
  revalidatePath("/", "layout");
}

// ব্যবহারকারী যে Ad Account নিয়ে কাজ করবে সেটি সংরক্ষণ করে।
// শুধু সেই Ad Account গ্রহণ করা হয় যা Meta এই ব্যবহারকারীর তালিকায় দেখায়।
export async function selectAdAccount(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!AD_ACCOUNT_ID_PATTERN.test(accountId)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return;

  let account;
  try {
    const accounts = await getAdAccounts(
      decrypt(connection.access_token_encrypted),
    );
    account = accounts.find((acc) => acc.id === accountId);
  } catch (err) {
    console.error(
      "ad account verification failed",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  if (!account) return;

  const changed = connection.selected_ad_account_id !== accountId;

  await supabase
    .from("meta_connections")
    .update({
      selected_ad_account_id: account.id,
      selected_ad_account_name: account.name,
      selected_ad_account_currency: account.currency,
      selected_ad_account_timezone: account.timezone_name,
      // নতুন Ad Account হলে ড্যাশবোর্ড খোলার সময় নতুন করে ডাটা আনবে
      ...(changed
        ? { insights_synced_at: null, insights_today_synced_at: null, insights_synced_from: null }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  revalidateAppPages();
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
