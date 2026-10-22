"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import {
  AD_ACCOUNT_ID_PATTERN,
  getAdAccounts,
  revokePermissions,
} from "@/lib/meta/graph";

function revalidateAppPages() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
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
      // নতুন Ad Account হলে ড্যাশবোর্ড খোলার সময় নতুন করে ডাটা আনবে
      ...(changed ? { insights_synced_at: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  revalidateAppPages();
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
