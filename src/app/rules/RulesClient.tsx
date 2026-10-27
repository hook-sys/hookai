"use client";

import { useActionState, useState, useTransition } from "react";
import { FlaskConical, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { Badge, Card, CardHeader, buttonClass, cn, inputClass } from "@/components/ui";
import {
  CAMPAIGN_ONLY_METRICS,
  MONEY_METRICS,
  RULE_ACTIONS,
  RULE_METRICS,
  RULE_WINDOWS,
  actionLabel,
  metricLabel,
  ruleTemplates,
  windowLabel,
  type AdRule,
} from "@/lib/rules/types";
import { deleteRule, markAlertsRead, runRulesNow, saveRule, setRulesPaused, toggleRule, type RuleState, type RunState } from "./actions";

type Objects = { id: string; name: string; active: boolean; adsets: { id: string; name: string; active: boolean }[] }[];
type Draft = Omit<AdRule, "id" | "user_id" | "ad_account_id" | "enabled"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  level: "adset",
  object_ids: [],
  metric: "cost_per_result",
  time_window: "today",
  operator: "gt",
  threshold: 0,
  min_spend: 0,
  min_results: 0,
  action: "pause",
  action_value: null,
  max_budget: null,
  cooldown_hours: 24,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function RuleForm({ initial, currency, objects, onDone }: { initial: Draft; currency: string; objects: Objects; onDone?: () => void }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<RuleState, FormData>(async (prev, fd) => {
    const res = await saveRule(prev, fd);
    if (res?.ok) onDone?.();
    return res;
  }, null);
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const money = MONEY_METRICS.has(d.metric);
  const list =
    d.level === "campaign"
      ? objects.map((c) => ({ id: c.id, name: c.name, active: c.active }))
      : objects.flatMap((c) => c.adsets.map((s) => ({ id: s.id, name: `${s.name} · ${c.name}`, active: s.active })));

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-zinc-900/10 p-4 dark:border-white/10">
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <Field label={tr("Rule name", "নিয়মের নাম")}>
        <input name="name" required maxLength={120} value={d.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Check", "কী যাচাই হবে")}>
          <select name="level" value={d.level} onChange={(e) => set("level", e.target.value as Draft["level"])} className={inputClass}>
            <option value="adset">{tr("Each ad set", "প্রতিটি Ad Set")}</option>
            <option value="campaign">{tr("Each campaign", "প্রতিটি ক্যাম্পেইন")}</option>
          </select>
        </Field>
        <Field label={tr("Time", "সময়")}>
          <select name="time_window" value={d.time_window} onChange={(e) => set("time_window", e.target.value as Draft["time_window"])} className={inputClass}>
            {RULE_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {windowLabel(w, tr)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_9rem]">
        <Field label={tr("Measure", "মাপকাঠি")}>
          <select name="metric" value={d.metric} onChange={(e) => set("metric", e.target.value as Draft["metric"])} className={inputClass}>
            {RULE_METRICS.map((m) => (
              <option key={m} value={m} disabled={d.level === "adset" && CAMPAIGN_ONLY_METRICS.has(m)}>
                {metricLabel(m, tr)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("Is", "যদি")}>
          <select name="operator" value={d.operator} onChange={(e) => set("operator", e.target.value as Draft["operator"])} className={inputClass}>
            <option value="gt">{tr("above", "বেশি হয়")}</option>
            <option value="lt">{tr("below", "কম হয়")}</option>
          </select>
        </Field>
        <Field label={money ? tr(`Limit (${currency})`, `সীমা (${currency})`) : tr("Limit", "সীমা")}>
          <input name="threshold" inputMode="decimal" required value={d.threshold} onChange={(e) => set("threshold", Number(e.target.value) || 0)} className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr(`Judge only after spending (${currency})`, `অন্তত এত খরচের পর বিচার (${currency})`)} hint={tr("Avoids decisions on too little data.", "কম ডাটায় ভুল সিদ্ধান্ত এড়াতে।")}>
          <input name="min_spend" inputMode="decimal" value={d.min_spend} onChange={(e) => set("min_spend", Number(e.target.value) || 0)} className={inputClass} />
        </Field>
        <Field label={tr("And at least this many results", "আর অন্তত এতগুলো রেজাল্ট")}>
          <input name="min_results" inputMode="numeric" value={d.min_results} onChange={(e) => set("min_results", Number(e.target.value) || 0)} className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tr("Then", "তাহলে")}>
          <select name="action" value={d.action} onChange={(e) => set("action", e.target.value as Draft["action"])} className={inputClass}>
            {RULE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a, null, tr).replace(/\s*0%/, "")}
              </option>
            ))}
          </select>
        </Field>
        {(d.action === "increase_budget" || d.action === "decrease_budget") && (
          <Field label={tr("By %", "কত %")}>
            <input name="action_value" inputMode="numeric" required value={d.action_value ?? ""} onChange={(e) => set("action_value", Number(e.target.value) || null)} className={inputClass} />
          </Field>
        )}
        {d.action === "increase_budget" && (
          <Field label={tr(`Never above (${currency}/day)`, `কখনো এর বেশি নয় (${currency}/দিন)`)}>
            <input name="max_budget" inputMode="decimal" required value={d.max_budget ?? ""} onChange={(e) => set("max_budget", Number(e.target.value) || null)} className={inputClass} />
          </Field>
        )}
      </div>
      <Field label={tr("Wait before acting again on the same item (hours)", "একই জিনিসে আবার কাজের আগে অপেক্ষা (ঘণ্টা)")}>
        <input name="cooldown_hours" inputMode="numeric" value={d.cooldown_hours} onChange={(e) => set("cooldown_hours", Number(e.target.value) || 24)} className={inputClass + " sm:w-32"} />
      </Field>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
          {d.object_ids.length ? tr(`Only ${d.object_ids.length} selected`, `শুধু বাছা ${d.object_ids.length}টি`) : tr("Applies to all active ones (choose specific)", "সব চালু-তে প্রযোজ্য (নির্দিষ্ট বাছতে চাইলে)")}
        </summary>
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-900/10 dark:border-white/10">
          {list.map((o) => (
            <li key={o.id} className="border-b border-zinc-900/[0.05] last:border-0 dark:border-white/[0.06]">
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                <input
                  type="checkbox"
                  name="object_ids"
                  value={o.id}
                  checked={d.object_ids.includes(o.id)}
                  onChange={(e) => set("object_ids", e.target.checked ? [...d.object_ids, o.id] : d.object_ids.filter((x) => x !== o.id))}
                  className="accent-indigo-600"
                />
                <span className={cn("truncate", !o.active && "text-zinc-400")}>{o.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tr("Save rule", "নিয়ম সংরক্ষণ")}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonClass("ghost")}>
            {tr("Cancel", "বাতিল")}
          </button>
        )}
      </div>
    </form>
  );
}

export function RuleEditor({ currency, objects }: { currency: string; objects: Objects }) {
  const tr = useTr();
  const [target, setTarget] = useState(1.5);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [key, setKey] = useState(0);
  const open = (d: Draft) => {
    setDraft(d);
    setKey((k) => k + 1);
  };

  if (draft) return <RuleForm key={key} initial={draft} currency={currency} objects={objects} onDone={() => setDraft(null)} />;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-900/15 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={tr(`Your target cost per result/order (${currency})`, `তোমার টার্গেট খরচ, প্রতি রেজাল্ট/অর্ডারে (${currency})`)}>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} className={inputClass + " w-32"} />
        </Field>
        <span className="pb-2 text-xs text-zinc-500">{tr("Ready-made rules use this number; you can change everything.", "তৈরি নিয়মগুলো এই সংখ্যা দিয়ে বসবে; সব বদলানো যায়।")}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ruleTemplates(target).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => open({ ...t.rule, name: tr(t.title[0], t.title[1]), object_ids: [] })}
            className="rounded-xl border border-zinc-900/10 px-3 py-2.5 text-left text-sm hover:bg-white/60 dark:border-white/10 dark:hover:bg-white/[0.04]"
          >
            <span className="block font-medium">{tr(t.title[0], t.title[1])}</span>
            <span className="block text-xs text-zinc-500">{tr(t.hint[0], t.hint[1])}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => open({ ...EMPTY })} className={buttonClass("ghost", "self-start px-0")}>
        <Plus className="size-4" aria-hidden />
        {tr("Blank rule", "খালি নিয়ম")}
      </button>
    </div>
  );
}

export function RuleCard({ rule, summary, lastRun, currency, objects }: { rule: AdRule; summary: string; lastRun: string | null; currency: string; objects: Objects }) {
  const tr = useTr();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing) {
    const { id, user_id: _u, ad_account_id: _a, enabled: _e, ...rest } = rule;
    return <RuleForm initial={{ ...rest, id, threshold: Number(rest.threshold), min_spend: Number(rest.min_spend), min_results: Number(rest.min_results) }} currency={currency} objects={objects} onDone={() => setEditing(false)} />;
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border border-zinc-900/10 p-4 dark:border-white/10", !rule.enabled && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{rule.name}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{summary}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {rule.level === "adset" ? tr("Ad sets", "Ad Set") : tr("Campaigns", "ক্যাম্পেইন")} ·{" "}
            {rule.object_ids.length ? tr(`${rule.object_ids.length} selected`, `${rule.object_ids.length}টি বাছা`) : tr("all active", "সব চালু")}
            {rule.max_budget ? ` · ${tr("max", "সর্বোচ্চ")} ${rule.max_budget} ${currency}` : ""}
            {lastRun ? ` · ${tr("last checked", "শেষ যাচাই")} ${lastRun}` : ""}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          aria-label={tr("Rule on/off", "নিয়ম চালু/বন্ধ")}
          disabled={pending}
          onClick={() => start(() => toggleRule(rule.id, !rule.enabled))}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", rule.enabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", rule.enabled ? "left-[1.375rem]" : "left-0.5")} />
        </button>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setEditing(true)} className={buttonClass("ghost", "px-0 text-xs")}>
          <Pencil className="size-3.5" aria-hidden />
          {tr("Edit", "বদলাও")}
        </button>
        <form
          action={deleteRule}
          onSubmit={(e) => {
            if (!window.confirm(tr("Delete this rule?", "নিয়মটা মুছবে?"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className={buttonClass("danger", "px-0 text-xs")}>
            <Trash2 className="size-3.5" aria-hidden />
            {tr("Delete", "মুছো")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function RunPanel() {
  const tr = useTr();
  const [state, setState] = useState<RunState>(null);
  const [pending, start] = useTransition();
  const run = (dry: boolean) => {
    if (!dry && !window.confirm(tr("Run the rules now? They may turn ads off or change budgets.", "এখনই নিয়ম চালাবে? বিজ্ঞাপন বন্ধ বা বাজেট বদল হতে পারে।"))) return;
    start(async () => setState(await runRulesNow(dry)));
  };
  return (
    <Card>
      <CardHeader
        icon={FlaskConical}
        title={tr("Try the rules", "নিয়ম পরীক্ষা")}
        description={tr("Test shows what would happen right now without changing anything.", "পরীক্ষা দেখায় এখন চালালে কী হতো, কিছু বদলায় না।")}
      />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(true)} className={buttonClass("primary")}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
            {tr("Test (no changes)", "পরীক্ষা (কিছু বদলাবে না)")}
          </button>
          <button type="button" disabled={pending} onClick={() => run(false)} className={buttonClass("secondary")}>
            <Play className="size-4" aria-hidden />
            {tr("Run now", "এখনই চালাও")}
          </button>
        </div>
        {state && !state.ok && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        {state?.ok && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              {state.dryRun ? tr("Test result: ", "পরীক্ষার ফল: ") : tr("Ran: ", "চালানো হয়েছে: ")}
              {tr(
                `${state.summary.checked} items checked, ${state.summary.events.length} matched.`,
                `${state.summary.checked}টি যাচাই, ${state.summary.events.length}টি নিয়মে মিলেছে।`,
              )}
            </p>
            {state.summary.events.map((e, i) => (
              <div key={i} className="rounded-lg glass-chip px-3 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={!e.ok ? "danger" : e.action === "notify" ? "neutral" : "brand"}>
                    {e.action === "pause" ? tr("Turn off", "বন্ধ") : e.action === "notify" ? tr("Alert", "অ্যালার্ট") : `${tr("Budget", "বাজেট")} ${e.old_value} → ${e.new_value}`}
                  </Badge>
                  <span className="font-medium">{e.object_name}</span>
                </span>
                <span className="block text-xs text-zinc-500">
                  {e.rule_name} · {e.detail}
                  {e.error && ` · ${e.error === "no_daily_budget" ? tr("budget is set at campaign level or lifetime", "বাজেট ক্যাম্পেইন লেভেলে বা লাইফটাইম") : e.error}`}
                </span>
              </div>
            ))}
            {state.summary.errors.map((er, i) => (
              <p key={i} className="text-xs text-red-600">{er}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function PauseAllSwitch({ paused }: { paused: boolean }) {
  const tr = useTr();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!paused && !window.confirm(tr("Pause all rules?", "সব নিয়ম থামাবে?"))) return;
        start(() => setRulesPaused(!paused));
      }}
      className={buttonClass(paused ? "primary" : "secondary")}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
      {paused ? tr("Resume all rules", "সব নিয়ম আবার চালু") : tr("Pause all rules", "সব নিয়ম থামাও")}
    </button>
  );
}

export function MarkReadButton() {
  const tr = useTr();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => markAlertsRead())} className={buttonClass("ghost", "px-0 text-xs")}>
      {tr("Mark read", "পড়া হয়েছে")}
    </button>
  );
}
