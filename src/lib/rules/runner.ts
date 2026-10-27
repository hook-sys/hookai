import { decrypt } from "@/lib/crypto";
import { formatAlerts, sendWhatsApp, type WhatsAppProvider } from "@/lib/notify/whatsapp";
import { getAccountInfo, runAccountRules, type NewAlert, type RecentAction, type RuleEvent, type RuleOrder } from "./engine";
import { checkAccountHealth } from "./health";
import type { AdRule } from "./types";

// একজন ব্যবহারকারীর সব অ্যাকাউন্টে নিয়ম আর স্বাস্থ্য পরীক্ষা চালানো। cron আর "এখনই চালাও" দুটোই এটা ব্যবহার করে;
// কোথায় লেখা হবে (RPC নাকি লগইন করা ক্লায়েন্ট) সেটা বাইরে থেকে দেওয়া হয়।

export type UserSnapshot = {
  user_id: string;
  token: string; // এনক্রিপ্টেড
  alerts_enabled: boolean;
  rules_paused: boolean;
  whatsapp_provider: WhatsAppProvider | null;
  whatsapp_to: string | null;
  whatsapp_credentials: string | null;
  accounts: string[];
  rules: AdRule[];
  orders: RuleOrder[];
  recent_actions: RecentAction[];
};

export type Writer = {
  // নতুন (আগে না থাকা) অ্যালার্টগুলো ফেরত দেয়
  write: (events: RuleEvent[], alerts: NewAlert[], ruleIds: string[]) => Promise<{ id: string; title: string; body: string | null }[]>;
  markSent: (ids: string[], error: string | null) => Promise<void>;
};

export type UserRunSummary = {
  user_id: string;
  accounts: number;
  checked: number;
  actions: number;
  alerts: number;
  whatsapp: "sent" | "skipped" | "failed";
  errors: string[];
  events: RuleEvent[];
  newAlerts: { title: string; body: string | null }[];
};

export async function runForUser(u: UserSnapshot, writer: Writer, opts: { dryRun: boolean; onlyAccount?: string }): Promise<UserRunSummary> {
  const token = decrypt(u.token);
  const rules = u.rules_paused ? [] : u.rules.map((r) => ({ ...r, threshold: Number(r.threshold), min_spend: Number(r.min_spend), min_results: Number(r.min_results), action_value: r.action_value === null ? null : Number(r.action_value), max_budget: r.max_budget === null ? null : Number(r.max_budget) }));
  const accounts = [...new Set([...u.accounts, ...rules.map((r) => r.ad_account_id)])].filter(
    (a) => !opts.onlyAccount || a === opts.onlyAccount,
  );

  const events: RuleEvent[] = [];
  const alerts: NewAlert[] = [];
  const errors: string[] = [];
  let checked = 0;

  for (const acc of accounts) {
    try {
      const accRules = rules.filter((r) => r.ad_account_id === acc);
      const res = accRules.length
        ? await runAccountRules({ token, accountId: acc, rules: accRules, orders: u.orders, recentActions: u.recent_actions, dryRun: opts.dryRun })
        : { account: await getAccountInfo(token, acc), events: [], alerts: [], checked: 0 };
      events.push(...res.events);
      alerts.push(...res.alerts);
      checked += res.checked;
      if (u.alerts_enabled && !opts.dryRun) alerts.push(...(await checkAccountHealth(token, res.account)));
    } catch (err) {
      errors.push(`${acc}: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
    }
  }

  if (opts.dryRun) {
    return {
      user_id: u.user_id, accounts: accounts.length, checked, actions: events.filter((e) => e.action !== "notify").length,
      alerts: alerts.length, whatsapp: "skipped", errors, events, newAlerts: alerts.map((a) => ({ title: a.title, body: a.body })),
    };
  }

  const fresh = await writer.write(events, alerts, [...new Set(rules.filter((r) => accounts.includes(r.ad_account_id)).map((r) => r.id))]);
  let whatsapp: UserRunSummary["whatsapp"] = "skipped";
  if (fresh.length && u.alerts_enabled && u.whatsapp_provider && u.whatsapp_to && u.whatsapp_credentials) {
    const sent = await sendWhatsApp(
      { provider: u.whatsapp_provider, to: u.whatsapp_to, credentialsEncrypted: u.whatsapp_credentials },
      formatAlerts(fresh),
    );
    await writer.markSent(fresh.map((a) => a.id), sent.ok ? null : sent.error);
    whatsapp = sent.ok ? "sent" : "failed";
    if (!sent.ok) errors.push(sent.error);
  }
  return {
    user_id: u.user_id, accounts: accounts.length, checked, actions: events.filter((e) => e.action !== "notify").length,
    alerts: fresh.length, whatsapp, errors, events, newAlerts: fresh.map((a) => ({ title: a.title, body: a.body })),
  };
}
