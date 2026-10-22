"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import {
  AD_ACCOUNT_ID_PATTERN,
  getAdAccounts,
  revokePermissions,
} from "@/lib/meta/graph";

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
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return;

  try {
    const accounts = await getAdAccounts(
      decrypt(connection.access_token_encrypted),
    );
    if (!accounts.some((acc) => acc.id === accountId)) return;
  } catch (err) {
    console.error(
      "ad account verification failed",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  await supabase
    .from("meta_connections")
    .update({
      selected_ad_account_id: accountId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
}

// Meta-তে অনুমতি বাতিল করে, তারপর সংরক্ষিত সংযোগ (টোকেনসহ) মুছে দেয়
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

  await supabase.from("meta_connections").delete().eq("user_id", user.id);
  revalidatePath("/dashboard");
}
