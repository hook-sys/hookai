import { notFound, redirect } from "next/navigation";
import { Bell, Building2, History, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient } from "@/lib/clients";
import { loadAccountStructure } from "@/lib/meta/manage";
import { actionLabel, metricLabel, windowLabel, type AdRule } from "@/lib/rules/types";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { RuleCard, RuleEditor, RunPanel, PauseAllSwitch, MarkReadButton } from "./RulesClient";
import WhatsAppForm from "./WhatsAppForm";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Automatic rules", "স্বয়ংক্রিয় নিয়ম") };
}

export default async function RulesPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: conn } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  const scope = await accountInCurrentClient(supabase, user.id, conn?.selected_ad_account_id ?? null);
  if (!conn?.selected_ad_account_id || !scope.ok) {
    return (
      <AppShell active="rules">
        <PageHeader title={tr("Automatic rules", "স্বয়ংক্রিয় নিয়ম")} />
        <EmptyState
          icon={Building2}
          title={tr("Pick an ad account", "একটা Ad Account বাছো")}
          text={tr("Choose the client's ad account from the menu at the top.", "উপরের মেনু থেকে ক্লায়েন্টের Ad Account বাছো।")}
        />
      </AppShell>
    );
  }
  const accountId = conn.selected_ad_account_id;
  const currency = (conn.selected_ad_account_currency as string | null) ?? "";

  const [{ data: rules }, { data: events }, { data: alerts }, { data: settings }, structure] = await Promise.all([
    supabase.from("ad_rules").select("*").eq("user_id", user.id).eq("ad_account_id", accountId).order("created_at"),
    supabase
      .from("rule_events")
      .select("id, rule_name, object_name, level, action, detail, ok, error, created_at")
      .eq("user_id", user.id)
      .eq("ad_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("alerts")
      .select("id, title, body, severity, sent_at, send_error, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("notify_settings").select("alerts_enabled, rules_paused, whatsapp_provider, whatsapp_to, credentials_encrypted").eq("user_id", user.id).maybeSingle(),
    loadAccountStructure(decrypt(conn.access_token_encrypted), accountId, currency).catch(() => []),
  ]);

  const objects = structure.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.effective_status === "ACTIVE",
    adsets: c.adsets.map((s) => ({ id: s.id, name: s.name, active: s.effective_status === "ACTIVE" })),
  }));
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const paused = settings?.rules_paused ?? false;
  const unread = (alerts ?? []).filter((a) => !a.read_at).length;

  const summary = (r: AdRule) =>
    tr(
      `If ${metricLabel(r.metric, tr)} is ${r.operator === "gt" ? "above" : "below"} ${r.threshold} (${windowLabel(r.time_window, tr)})${r.min_spend ? `, after ${r.min_spend} ${currency} spend` : ""} → ${actionLabel(r.action, r.action_value, tr)}`,
      `${windowLabel(r.time_window, tr)} ${metricLabel(r.metric, tr)} ${r.threshold}-এর ${r.operator === "gt" ? "বেশি" : "কম"} হলে${r.min_spend ? ` (অন্তত ${r.min_spend} ${currency} খরচের পর)` : ""} → ${actionLabel(r.action, r.action_value, tr)}`,
    );

  return (
    <AppShell active="rules">
      <PageHeader
        title={tr("Automatic rules", "স্বয়ংক্রিয় নিয়ম")}
        description={tr(
          `${conn.selected_ad_account_name ?? accountId} · checked every hour; changes are logged in Ads control`,
          `${conn.selected_ad_account_name ?? accountId} · প্রতি ঘণ্টায় যাচাই হয়; প্রতিটি পরিবর্তন বিজ্ঞাপন নিয়ন্ত্রণের লগে থাকে`,
        )}
        actions={<PauseAllSwitch paused={paused} />}
      />
      {paused && (
        <Notice tone="warning">
          {tr("All rules are paused. Alerts still arrive.", "সব নিয়ম থামানো আছে। অ্যালার্ট তবু আসবে।")}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Zap} title={tr("Rules", "নিয়ম")} description={tr("Only active campaigns and ad sets are checked.", "শুধু চালু ক্যাম্পেইন আর Ad Set যাচাই হয়।")} />
            <div className="flex flex-col gap-3 p-5">
              {(rules ?? []).map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r as AdRule}
                  summary={summary(r as AdRule)}
                  lastRun={r.last_run_at ? when(r.last_run_at) : null}
                  currency={currency}
                  objects={objects}
                />
              ))}
              {(rules ?? []).length === 0 && (
                <p className="text-sm text-zinc-500">{tr("No rules yet. Start from a ready-made one below.", "এখনো কোনো নিয়ম নেই। নিচের তৈরি নিয়ম থেকে শুরু করো।")}</p>
              )}
              <RuleEditor currency={currency} objects={objects} />
            </div>
          </Card>

          <RunPanel />

          <Card>
            <CardHeader icon={History} title={tr("What the rules did", "নিয়ম যা করেছে")} />
            <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.07]">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={!e.ok ? "danger" : e.action === "notify" ? "neutral" : "brand"}>
                      {e.action === "pause" ? tr("Turned off", "বন্ধ") : e.action === "notify" ? tr("Alert", "অ্যালার্ট") : e.action === "increase_budget" ? tr("Budget up", "বাজেট বাড়ানো") : tr("Budget down", "বাজেট কমানো")}
                    </Badge>
                    <span className="font-medium">{e.object_name}</span>
                    <span className="text-xs text-zinc-400">{when(e.created_at)}</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {e.rule_name} · {e.detail}
                    {e.error && ` · ${e.error}`}
                  </span>
                </li>
              ))}
              {(events ?? []).length === 0 && <li className="px-5 py-4 text-sm text-zinc-500">{tr("Nothing yet.", "এখনো কিছু হয়নি।")}</li>}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-6 self-start">
          <Card>
            <CardHeader
              icon={Bell}
              title={tr("Alerts", "অ্যালার্ট")}
              description={unread ? tr(`${unread} new`, `${unread}টি নতুন`) : undefined}
              action={unread ? <MarkReadButton /> : undefined}
            />
            <ul className="max-h-[28rem] divide-y divide-zinc-900/[0.06] overflow-y-auto dark:divide-white/[0.07]">
              {(alerts ?? []).map((a) => (
                <li key={a.id} className={a.read_at ? "px-5 py-3 text-sm" : "bg-indigo-50/40 px-5 py-3 text-sm dark:bg-indigo-950/30"}>
                  <span className="block font-medium">{a.title}</span>
                  {a.body && <span className="block text-xs text-zinc-500">{a.body}</span>}
                  <span className="block text-[11px] text-zinc-400">
                    {when(a.created_at)}
                    {a.sent_at ? ` · ${tr("sent to WhatsApp", "WhatsApp-এ পাঠানো")}` : a.send_error ? ` · ${tr("WhatsApp failed", "WhatsApp যায়নি")}` : ""}
                  </span>
                </li>
              ))}
              {(alerts ?? []).length === 0 && <li className="px-5 py-4 text-sm text-zinc-500">{tr("No alerts.", "কোনো অ্যালার্ট নেই।")}</li>}
            </ul>
          </Card>
          <WhatsAppForm
            provider={settings?.whatsapp_provider ?? null}
            to={settings?.whatsapp_to ?? ""}
            hasCredentials={Boolean(settings?.credentials_encrypted)}
            alertsEnabled={settings?.alerts_enabled ?? true}
          />
        </div>
      </div>
    </AppShell>
  );
}
