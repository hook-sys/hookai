"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { getUserPlan } from "@/lib/plans";
import { SteadfastError, checkSteadfastKeys, syncSteadfast } from "@/lib/couriers/steadfast";
import type { OrderFormState } from "./actions";

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function connectSteadfast(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const { supabase, user } = await session();
  const plan = await getUserPlan(supabase, user.id);
  if (!plan.courierSync) {
    return { ok: false, error: tr(`Courier sync isn't included in the ${plan.name} plan.`, `${plan.name} প্ল্যানে কুরিয়ার সংযোগ নেই।`) };
  }

  const apiKey = String(formData.get("api_key") ?? "").trim();
  const secretKey = String(formData.get("secret_key") ?? "").trim();
  if (!/^[\w-]{8,200}$/.test(apiKey) || !/^[\w-]{8,200}$/.test(secretKey)) {
    return { ok: false, error: tr("Paste both the API key and the secret key.", "API key আর Secret key দুটোই বসাও।") };
  }

  let valid = false;
  try {
    valid = await checkSteadfastKeys({ apiKey, secretKey });
  } catch (err) {
    if (!(err instanceof SteadfastError && (err.status === 401 || err.status === 403))) {
      console.error("steadfast check failed", err instanceof Error ? err.message : err);
      return { ok: false, error: tr("Couldn't reach Steadfast. Try again in a moment.", "Steadfast-এ পৌঁছানো যায়নি। একটু পরে আবার চেষ্টা করো।") };
    }
  }
  if (!valid) return { ok: false, error: tr("Steadfast didn't accept these keys. Check them in your Steadfast panel.", "Steadfast এই key গ্রহণ করেনি। Steadfast প্যানেল থেকে মিলিয়ে দেখো।") };

  // আগে থেকে সংযোগ থাকলে webhook token একই থাকে, যাতে Steadfast-এ বসানো ঠিকানা বদলাতে না হয়
  const { data: existing } = await supabase
    .from("courier_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("courier", "steadfast")
    .maybeSingle();

  const fields = { api_key_encrypted: encrypt(apiKey), secret_key_encrypted: encrypt(secretKey) };
  let error;
  if (existing) {
    ({ error } = await supabase.from("courier_connections").update(fields).eq("id", existing.id).eq("user_id", user.id));
  } else {
    const token = randomBytes(32).toString("hex");
    ({ error } = await supabase.from("courier_connections").insert({
      ...fields,
      user_id: user.id,
      courier: "steadfast",
      webhook_token_encrypted: encrypt(token),
      webhook_token_hash: createHash("sha256").update(token).digest("hex"),
    }));
  }
  if (error) {
    console.error("steadfast save failed", error.message);
    return { ok: false, error: tr("Couldn't save the connection. Try again.", "সংযোগ সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }
  revalidatePath("/orders");
  return { ok: true, message: tr("Steadfast connected.", "Steadfast কানেক্ট হয়েছে।") };
}

export async function disconnectSteadfast() {
  const { supabase, user } = await session();
  await supabase.from("courier_connections").delete().eq("user_id", user.id).eq("courier", "steadfast");
  revalidatePath("/orders");
  redirect("/orders?courier=disconnected#courier");
}

export async function syncSteadfastNow(formData: FormData) {
  const { supabase, user } = await session();
  const back = String(formData.get("back") ?? "/orders");
  const safeBack = back.startsWith("/orders") ? back.split("#")[0] : "/orders";
  const join = safeBack.includes("?") ? "&" : "?";

  const plan = await getUserPlan(supabase, user.id);
  const { data: connection } = await supabase
    .from("courier_connections")
    .select("id, api_key_encrypted, secret_key_encrypted")
    .eq("user_id", user.id)
    .eq("courier", "steadfast")
    .maybeSingle();
  if (!connection || !plan.courierSync) redirect(`${safeBack}${join}courier=missing#courier`);

  let query: string;
  try {
    const r = await syncSteadfast(supabase, user.id, connection);
    query = `courier=synced&checked=${r.checked}&updated=${r.updated}`;
  } catch (err) {
    console.error("steadfast sync failed", err instanceof Error ? err.message : err);
    query = err instanceof SteadfastError && err.status === 401 ? "courier=badkeys" : "courier=error";
  }
  revalidatePath("/orders");
  redirect(`${safeBack}${join}${query}#courier`);
}
