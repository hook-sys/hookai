"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { currentClient } from "@/lib/clients";
import { getUserPlan } from "@/lib/plans";
import { isAuthError, isCourierId } from "@/lib/couriers/common";
import { COURIER_LABELS, listConnections, sealCredentials, syncCouriers } from "@/lib/couriers";
import { checkSteadfast } from "@/lib/couriers/steadfast";
import { loginPathao } from "@/lib/couriers/pathao";
import { checkCarrybee } from "@/lib/couriers/carrybee";
import type { OrderFormState } from "./actions";

const CARRYBEE_SETUP_MS = 10 * 60 * 1000;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const field = (formData: FormData, name: string, max = 300) => String(formData.get(name) ?? "").trim().slice(0, max);
const looksLikeKey = (v: string) => /^[\w.\-=+/]{4,300}$/.test(v);

function webhookSecretFields(secret: string) {
  return {
    webhook_token_encrypted: encrypt(secret),
    webhook_token_hash: createHash("sha256").update(secret).digest("hex"),
  };
}

// কুরিয়ারের সাথে মিলিয়ে দেখে তবেই সেভ করে। আগে থেকে সংযোগ থাকলে webhook secret একই থাকে।
export async function connectCourier(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const { supabase, user } = await session();
  const courier = formData.get("courier");
  if (!isCourierId(courier)) return { ok: false, error: tr("Unknown courier.", "অচেনা কুরিয়ার।") };
  const name = COURIER_LABELS[courier];

  const plan = await getUserPlan(supabase, user.id);
  if (!plan.courierSync) {
    return { ok: false, error: tr(`Courier sync isn't included in the ${plan.name} plan.`, `${plan.name} প্ল্যানে কুরিয়ার সংযোগ নেই।`) };
  }

  const missing = { ok: false as const, error: tr("Fill in every field.", "সবগুলো ঘর পূরণ করো।") };
  let credentials: object;
  try {
    if (courier === "steadfast") {
      const c = { apiKey: field(formData, "api_key"), secretKey: field(formData, "secret_key") };
      if (!looksLikeKey(c.apiKey) || !looksLikeKey(c.secretKey)) return missing;
      await checkSteadfast(c);
      credentials = c;
    } else if (courier === "pathao") {
      const input = {
        clientId: field(formData, "client_id"),
        clientSecret: field(formData, "client_secret"),
        username: field(formData, "username"),
        password: String(formData.get("password") ?? ""),
      };
      if (!input.clientId || !looksLikeKey(input.clientSecret) || !input.username || !input.password) return missing;
      // পাসওয়ার্ড শুধু টোকেন নিতে ব্যবহার হয়, কোথাও জমা থাকে না
      credentials = await loginPathao(input);
    } else {
      const c = {
        clientId: field(formData, "client_id"),
        clientSecret: field(formData, "client_secret"),
        clientContext: field(formData, "client_context"),
      };
      if (!c.clientId || !looksLikeKey(c.clientSecret) || !c.clientContext) return missing;
      await checkCarrybee(c);
      credentials = c;
    }
  } catch (err) {
    if (isAuthError(err) || (err instanceof Error && /HTTP 4\d\d/.test(err.message))) {
      return {
        ok: false,
        error: tr(
          `${name} didn't accept these details. Check them in your ${name} merchant panel.`,
          `${name} এই তথ্য গ্রহণ করেনি। ${name} মার্চেন্ট প্যানেল থেকে মিলিয়ে দেখো।`,
        ),
      };
    }
    // Pathao ও CarryBee ভুল তথ্যেও কখনো 500 দেয়, তাই এখানে দুটো কারণই বলা হয়
    console.error(`${courier} check failed`, err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: tr(
        `${name} couldn't verify these details. Double-check each field; if they're right, try again in a few minutes.`,
        `${name} এই তথ্য যাচাই করতে পারেনি। প্রতিটা ঘর মিলিয়ে দেখো; ঠিক থাকলে কয়েক মিনিট পরে আবার চেষ্টা করো।`,
      ),
    };
  }

  const { client } = await currentClient(supabase, user.id);
  if (!client) return { ok: false, error: tr("Create a client first (Clients page).", "আগে একটা ক্লায়েন্ট বানাও (ক্লায়েন্ট পাতা)।") };
  const { data: existing } = await supabase
    .from("courier_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .eq("courier", courier)
    .maybeSingle();

  const fields = { credentials_encrypted: sealCredentials(credentials) };
  let error;
  if (existing) {
    ({ error } = await supabase.from("courier_connections").update(fields).eq("id", existing.id).eq("user_id", user.id));
  } else {
    // Steadfast ও Pathao-র webhook secret Hook বানায়; CarryBee-র secret CarryBee দেয়, পরে বসানো হয়
    const secret = courier === "carrybee" ? null : randomBytes(32).toString("hex");
    ({ error } = await supabase.from("courier_connections").insert({
      ...fields,
      ...(secret ? webhookSecretFields(secret) : {}),
      user_id: user.id,
      client_id: client.id,
      courier,
    }));
  }
  if (error) {
    console.error(`${courier} save failed`, error.message);
    return { ok: false, error: tr("Couldn't save the connection. Try again.", "সংযোগ সেভ করা যায়নি। আবার চেষ্টা করো।") };
  }
  revalidatePath("/orders");
  return { ok: true, message: tr(`${name} connected.`, `${name} কানেক্ট হয়েছে।`) };
}

// CarryBee-র Webhook Integration পাতায় দেখানো secret Hook-এ বসানো
export async function saveCarrybeeSecret(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const tr = await getTr();
  const { supabase, user } = await session();
  const secret = field(formData, "webhook_secret", 200);
  if (!/^[\w-]{8,200}$/.test(secret)) {
    return { ok: false, error: tr("Paste the integration secret CarryBee shows.", "CarryBee-র দেখানো integration secret বসাও।") };
  }
  const { client } = await currentClient(supabase, user.id);
  if (!client) return { ok: false, error: tr("Create a client first (Clients page).", "আগে একটা ক্লায়েন্ট বানাও (ক্লায়েন্ট পাতা)।") };
  const { error } = await supabase
    .from("courier_connections")
    .update({ ...webhookSecretFields(secret), webhook_setup_until: new Date(Date.now() + CARRYBEE_SETUP_MS).toISOString() })
    .eq("user_id", user.id)
    .eq("client_id", client.id)
    .eq("courier", "carrybee");
  if (error) return { ok: false, error: tr("Couldn't save. Try again.", "সেভ করা যায়নি। আবার চেষ্টা করো।") };
  revalidatePath("/orders");
  return {
    ok: true,
    message: tr(
      "Saved. Now press Add Webhook in CarryBee within 10 minutes.",
      "সেভ হয়েছে। এখন ১০ মিনিটের মধ্যে CarryBee-তে Add Webhook চাপো।",
    ),
  };
}

// CarryBee-র webhook যোগ করার পরীক্ষার জন্য আবার ১০ মিনিট সময় খোলা
export async function openCarrybeeSetup() {
  const { supabase, user } = await session();
  const { client } = await currentClient(supabase, user.id);
  await supabase
    .from("courier_connections")
    .update({ webhook_setup_until: new Date(Date.now() + CARRYBEE_SETUP_MS).toISOString() })
    .eq("user_id", user.id)
    .eq("client_id", client?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("courier", "carrybee")
    .not("webhook_token_hash", "is", null);
  revalidatePath("/orders");
  redirect("/orders?courier=setup#couriers");
}

export async function disconnectCourier(formData: FormData) {
  const courier = formData.get("courier");
  const { supabase, user } = await session();
  const { client } = await currentClient(supabase, user.id);
  if (isCourierId(courier) && client) {
    await supabase.from("courier_connections").delete().eq("user_id", user.id).eq("client_id", client.id).eq("courier", courier);
  }
  revalidatePath("/orders");
  redirect(`/orders?courier=disconnected&which=${isCourierId(courier) ? courier : ""}#couriers`);
}

export async function syncCouriersNow(formData: FormData) {
  const { supabase, user } = await session();
  const back = String(formData.get("back") ?? "/orders");
  const safeBack = back.startsWith("/orders") ? back.split("#")[0] : "/orders";
  const join = safeBack.includes("?") ? "&" : "?";

  const plan = await getUserPlan(supabase, user.id);
  const { client } = await currentClient(supabase, user.id);
  const connections = await listConnections(supabase, user.id, client?.id);
  if (connections.length === 0 || !plan.courierSync) redirect(`${safeBack}${join}courier=missing#couriers`);

  let query: string;
  try {
    const r = await syncCouriers(supabase, user.id, connections);
    query = `courier=synced&checked=${r.checked}&updated=${r.updated}`;
    if (r.rejected.length) query += `&rejected=${r.rejected.join(",")}`;
    else if (r.failed > 0 && r.updated === 0) query = "courier=error";
  } catch (err) {
    console.error("courier sync failed", err instanceof Error ? err.message : err);
    query = "courier=error";
  }
  revalidatePath("/orders");
  redirect(`${safeBack}${join}${query}#couriers`);
}

