"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient, currentClient } from "@/lib/clients";
import { clearLiveCache } from "@/lib/insights/live";
import { addDays } from "@/lib/dates";
import { sendWhatsApp } from "@/lib/notify/whatsapp";
import { runForUser, type UserRunSummary, type UserSnapshot } from "@/lib/rules/runner";
import { CAMPAIGN_ONLY_METRICS, RULE_ACTIONS, RULE_METRICS, RULE_WINDOWS, type AdRule } from "@/lib/rules/types";

export type RuleState = { ok: true; message: string } | { ok: false; error: string } | null;
export type RunState = { ok: true; dryRun: boolean; summary: Omit<UserRunSummary, "user_id"> } | { ok: false; error: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

// Supabase একবারে ১০০০ সারির বেশি দেয় না, তাই পাতায় পাতায় আনা
async function loadRecentOrders(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, since: string) {
  const all: { campaign_id: string; order_date: string; status: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await supabase
      .from("orders")
      .select("campaign_id, order_date, status")
      .eq("user_id", userId)
      .not("campaign_id", "is", null)
      .gte("order_date", since)
      .order("order_date")
      .range(from, from + 999);
    all.push(...((data ?? []) as typeof all));
    if (!data || data.length < 1000) break;
  }
  return all;
}
const ID_PATTERN = /^\d{5,25}$/;

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can manage rules.", "শুধু মালিক নিয়ম বদলাতে পারে।") } as const;
  const { data: c } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!c?.selected_ad_account_id) return { error: tr("Pick an ad account first.", "আগে Ad Account বেছে নাও।") } as const;
  const scope = await accountInCurrentClient(supabase, user.id, c.selected_ad_account_id);
  if (!scope.ok) return { error: tr("Pick one of this client's ad accounts first.", "আগে এই ক্লায়েন্টের একটা Ad Account বাছো।") } as const;
  return { tr, supabase, user, tokenEncrypted: c.access_token_encrypted as string, accountId: c.selected_ad_account_id as string };
}

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function saveRule(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, accountId } = ctx;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const level = formData.get("level") === "campaign" ? "campaign" : "adset";
  const metric = String(formData.get("metric"));
  const window = String(formData.get("time_window"));
  const operator = formData.get("operator") === "lt" ? "lt" : "gt";
  const action = String(formData.get("action"));
  const threshold = numOrNull(formData.get("threshold"));
  const minSpend = numOrNull(formData.get("min_spend")) ?? 0;
  const minResults = numOrNull(formData.get("min_results")) ?? 0;
  const actionValue = numOrNull(formData.get("action_value"));
  const maxBudget = numOrNull(formData.get("max_budget"));
  const cooldown = Math.round(numOrNull(formData.get("cooldown_hours")) ?? 24);
  const objectIds = formData.getAll("object_ids").map(String).filter((x) => ID_PATTERN.test(x)).slice(0, 100);

  if (!name) return { ok: false, error: tr("Give the rule a name.", "নিয়মের একটা নাম দাও।") };
  if (!(RULE_METRICS as readonly string[]).includes(metric) || !(RULE_WINDOWS as readonly string[]).includes(window) || !(RULE_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: tr("Invalid rule.", "ভুল নিয়ম।") };
  }
  if (level === "adset" && CAMPAIGN_ONLY_METRICS.has(metric as AdRule["metric"])) {
    return { ok: false, error: tr("Order-based checks work at campaign level only.", "অর্ডারের হিসাব শুধু ক্যাম্পেইন লেভেলে হয়।") };
  }
  if (threshold === null) return { ok: false, error: tr("Enter the limit.", "সীমার সংখ্যাটা দাও।") };
  if ((action === "increase_budget" || action === "decrease_budget") && (!actionValue || actionValue > 50)) {
    return { ok: false, error: tr("Budget change must be between 1% and 50%.", "বাজেট বদল ১% থেকে ৫০%-এর মধ্যে হতে হবে।") };
  }
  if (action === "increase_budget" && !maxBudget) {
    return { ok: false, error: tr("Set a maximum daily budget so it never grows too far.", "সর্বোচ্চ দৈনিক বাজেট দাও, যাতে বাজেট সীমার বেশি না বাড়ে।") };
  }
  if (cooldown < 1 || cooldown > 168) return { ok: false, error: tr("Wait time must be 1–168 hours.", "অপেক্ষার সময় ১ থেকে ১৬৮ ঘণ্টা।") };

  const { client } = await currentClient(supabase, user.id);
  const row = {
    user_id: user.id,
    client_id: client?.id ?? null,
    ad_account_id: accountId,
    name,
    level,
    object_ids: objectIds,
    metric,
    time_window: window,
    operator,
    threshold,
    min_spend: minSpend,
    min_results: minResults,
    action,
    action_value: action === "increase_budget" || action === "decrease_budget" ? actionValue : null,
    max_budget: action === "increase_budget" ? maxBudget : null,
    cooldown_hours: cooldown,
    updated_at: new Date().toISOString(),
  };
  const res = UUID.test(id)
    ? await supabase.from("ad_rules").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("ad_rules").insert(row);
  if (res.error) return { ok: false, error: tr("Couldn't save the rule.", "নিয়ম সংরক্ষণ করা যায়নি।") };
  revalidatePath("/rules");
  return { ok: true, message: tr("Saved. It runs every hour.", "সংরক্ষণ হয়েছে। প্রতি ঘণ্টায় চলবে।") };
}

export async function toggleRule(id: string, enabled: boolean) {
  const ctx = await context();
  if ("error" in ctx || !UUID.test(id)) return;
  await ctx.supabase.from("ad_rules").update({ enabled, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.user.id);
  revalidatePath("/rules");
}

export async function deleteRule(formData: FormData) {
  const ctx = await context();
  const id = String(formData.get("id") ?? "");
  if ("error" in ctx || !UUID.test(id)) return;
  await ctx.supabase.from("ad_rules").delete().eq("id", id).eq("user_id", ctx.user.id);
  revalidatePath("/rules");
}

export async function setRulesPaused(paused: boolean) {
  const ctx = await context();
  if ("error" in ctx) return;
  await ctx.supabase
    .from("notify_settings")
    .upsert({ user_id: ctx.user.id, rules_paused: paused, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/rules");
}

// "এখনই চালাও": dryRun হলে শুধু দেখায় কী হতো
export async function runRulesNow(dryRun: boolean): Promise<RunState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user, tokenEncrypted, accountId } = ctx;

  const since = addDays(new Date().toISOString().slice(0, 10), -14);
  const [{ data: rules }, { data: settings }, { data: orders }, { data: recent }] = await Promise.all([
    supabase.from("ad_rules").select("*").eq("user_id", user.id).eq("ad_account_id", accountId).eq("enabled", true),
    supabase.from("notify_settings").select("*").eq("user_id", user.id).maybeSingle(),
    loadRecentOrders(supabase, user.id, since).then((data) => ({ data })),
    supabase
      .from("rule_events")
      .select("rule_id, object_id, created_at")
      .eq("user_id", user.id)
      .eq("ok", true)
      .neq("action", "notify")
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
  ]);

  const snapshot: UserSnapshot = {
    user_id: user.id,
    token: tokenEncrypted,
    alerts_enabled: settings?.alerts_enabled ?? true,
    // পরীক্ষায় থামানো নিয়মও দেখানো হয়, যাতে বোঝা যায় চালু করলে কী হবে
    rules_paused: dryRun ? false : (settings?.rules_paused ?? false),
    whatsapp_provider: settings?.whatsapp_provider ?? null,
    whatsapp_to: settings?.whatsapp_to ?? null,
    whatsapp_credentials: settings?.credentials_encrypted ?? null,
    accounts: [accountId],
    rules: (rules ?? []) as AdRule[],
    orders: (orders ?? []) as UserSnapshot["orders"],
    recent_actions: (recent ?? []) as UserSnapshot["recent_actions"],
  };

  try {
    const summary = await runForUser(
      snapshot,
      {
        write: async (events, alerts, ruleIds) => {
          if (events.length) {
            await supabase.from("rule_events").insert(events.map(({ old_value: _o, new_value: _n, ...e }) => ({ ...e, user_id: user.id })));
            const changes = events.filter((e) => e.action !== "notify" && e.error !== "no_daily_budget");
            if (changes.length) {
              await supabase.from("ad_change_log").insert(
                changes.map((e) => ({
                  user_id: user.id, ad_account_id: e.ad_account_id, level: e.level, object_id: e.object_id, object_name: e.object_name,
                  action: e.action === "pause" ? "status" : "daily_budget", old_value: e.old_value ?? null, new_value: e.new_value ?? null,
                  ok: e.ok, error: e.error ?? null, source: "rule",
                })),
              );
            }
          }
          if (ruleIds.length) await supabase.from("ad_rules").update({ last_run_at: new Date().toISOString() }).in("id", ruleIds).eq("user_id", user.id);
          if (!alerts.length) return [];
          const { data } = await supabase
            .from("notifications")
            .upsert(alerts.map((a) => ({ ...a, user_id: user.id })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
            .select("id, title, body");
          return (data ?? []) as { id: string; title: string; body: string | null }[];
        },
        markSent: async (ids, err) => {
          if (!ids.length) return;
          await supabase.from("notifications").update({ sent_at: err ? null : new Date().toISOString(), send_error: err }).in("id", ids).eq("user_id", user.id);
        },
      },
      { dryRun, onlyAccount: accountId },
    );
    if (!dryRun && summary.actions > 0) await clearLiveCache(supabase, user.id, accountId);
    revalidatePath("/rules");
    const { user_id: _u, ...rest } = summary;
    return { ok: true, dryRun, summary: rest };
  } catch (err) {
    console.error("rules run failed", err instanceof Error ? err.message : err);
    return { ok: false, error: tr("Couldn't run the rules. Try again shortly.", "নিয়ম চালানো যায়নি। একটু পরে আবার চেষ্টা করো।") };
  }
}

// WhatsApp সেটিং
export async function saveWhatsApp(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user } = ctx;
  const provider = formData.get("provider") === "meta_cloud" ? "meta_cloud" : formData.get("provider") === "callmebot" ? "callmebot" : null;
  let to = String(formData.get("to") ?? "").replace(/\D/g, "");
  // বাংলাদেশি নম্বর 01... হলে দেশের কোড বসানো
  if (/^01\d{9}$/.test(to)) to = `88${to}`;
  const alertsEnabled = formData.get("alerts_enabled") === "on";

  const patch: Record<string, unknown> = { user_id: user.id, alerts_enabled: alertsEnabled, whatsapp_provider: provider, updated_at: new Date().toISOString() };
  if (provider) {
    if (!/^\d{8,15}$/.test(to)) return { ok: false, error: tr("Enter your WhatsApp number.", "তোমার WhatsApp নম্বর দাও।") };
    patch.whatsapp_to = to;
    if (provider === "callmebot") {
      const apikey = String(formData.get("apikey") ?? "").trim();
      if (apikey) {
        if (!/^\w{4,40}$/.test(apikey)) return { ok: false, error: tr("That API key doesn't look right.", "API key ঠিক মনে হচ্ছে না।") };
        patch.credentials_encrypted = encrypt(JSON.stringify({ apikey }));
      }
    } else {
      const phoneId = String(formData.get("phone_number_id") ?? "").trim();
      const token = String(formData.get("wa_token") ?? "").trim();
      const template = String(formData.get("template") ?? "").trim();
      const lang = String(formData.get("lang") ?? "en").trim() || "en";
      if (phoneId || token) {
        if (!/^\d{5,25}$/.test(phoneId) || token.length < 20 || !/^[a-z0-9_]{1,512}$/.test(template)) {
          return { ok: false, error: tr("Fill phone number ID, access token and template name.", "Phone number ID, access token আর template-এর নাম দাও।") };
        }
        patch.credentials_encrypted = encrypt(JSON.stringify({ phone_number_id: phoneId, token, template, lang }));
      }
    }
  } else {
    patch.whatsapp_to = null;
    patch.credentials_encrypted = null;
  }
  const { error } = await supabase.from("notify_settings").upsert(patch, { onConflict: "user_id" });
  if (error) return { ok: false, error: tr("Couldn't save.", "সংরক্ষণ করা যায়নি।") };
  revalidatePath("/rules");
  return { ok: true, message: tr("Saved.", "সংরক্ষণ হয়েছে।") };
}

export async function testWhatsApp(): Promise<RuleState> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error ?? "" };
  const { tr, supabase, user } = ctx;
  const { data: s } = await supabase.from("notify_settings").select("*").eq("user_id", user.id).maybeSingle();
  if (!s?.whatsapp_provider || !s.whatsapp_to || !s.credentials_encrypted) {
    return { ok: false, error: tr("Save your WhatsApp settings first.", "আগে WhatsApp সেটিং সংরক্ষণ করো।") };
  }
  const res = await sendWhatsApp(
    { provider: s.whatsapp_provider, to: s.whatsapp_to, credentialsEncrypted: s.credentials_encrypted },
    "Hook: পরীক্ষামূলক মেসেজ। অ্যালার্ট এভাবেই আসবে ✅",
  );
  return res.ok ? { ok: true, message: tr("Sent. Check WhatsApp.", "পাঠানো হয়েছে। WhatsApp দেখো।") } : { ok: false, error: res.error };
}

export async function markAlertsRead() {
  const ctx = await context();
  if ("error" in ctx) return;
  await ctx.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  revalidatePath("/rules");
}
