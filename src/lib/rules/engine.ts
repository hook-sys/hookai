import { graphGetAll, graphRequest, MetaApiError, type MetaAction } from "@/lib/meta/graph";
import { loadAccountStructure, minorFactor, setDailyBudget, setDeliveryStatus, type ManagedCampaign } from "@/lib/meta/manage";
import { pickPurchaseValue, pickPurchases } from "@/lib/metrics";
import { addDays, todayIn } from "@/lib/dates";
import { CAMPAIGN_ONLY_METRICS, type AdRule, type RuleLevel, type RuleWindow } from "./types";

// নিয়ম যাচাই আর কাজ: Meta থেকে আজকের/গত কয়েক দিনের হিসাব এনে প্রতিটি চালু ক্যাম্পেইন বা Ad Set-এ
// নিয়ম মিলিয়ে দেখা, মিললে বন্ধ করা বা বাজেট বদলানো। dryRun হলে শুধু দেখায় কী হতো, কিছু বদলায় না।

export type RuleOrder = { campaign_id: string; order_date: string; status: string };
export type RecentAction = { rule_id: string; object_id: string; created_at: string };

export type RuleEvent = {
  rule_id: string;
  rule_name: string;
  ad_account_id: string;
  level: RuleLevel;
  object_id: string;
  object_name: string;
  metric_value: number | null;
  action: string;
  detail: string;
  old_value?: string | null;
  new_value?: string | null;
  ok: boolean;
  error?: string | null;
};

export type NewAlert = {
  ad_account_id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  dedupe_key: string;
};

export type AccountInfo = { id: string; name: string; currency: string | null; timezone: string | null; status: number; disable_reason: number | null };

type Row = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  results?: { indicator: string; values?: { value: string }[] }[];
};

type Stats = { spend: number; impressions: number; linkClicks: number; results: number; purchases: number; purchaseValue: number };

const num = (v: unknown) => Number(v) || 0;

export async function getAccountInfo(token: string, accountId: string): Promise<AccountInfo> {
  const a = await graphRequest<{ id: string; name: string; currency?: string; timezone_name?: string; account_status?: number; disable_reason?: number }>(
    `/${accountId}`,
    { params: { fields: "id,name,currency,timezone_name,account_status,disable_reason" }, token },
  );
  return {
    id: a.id,
    name: a.name,
    currency: a.currency ?? null,
    timezone: a.timezone_name ?? null,
    status: a.account_status ?? 1,
    disable_reason: a.disable_reason ?? null,
  };
}

export function windowRange(w: RuleWindow, today: string) {
  const days = w === "today" ? 1 : w === "last_3d" ? 3 : 7;
  return { since: addDays(today, -(days - 1)), until: today };
}

async function fetchStats(token: string, accountId: string, level: RuleLevel, since: string, until: string) {
  const rows = await graphGetAll<Row>(
    `/${accountId}/insights`,
    {
      level,
      time_range: JSON.stringify({ since, until }),
      fields: `${level === "adset" ? "adset_id,adset_name," : ""}campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values,results`,
      limit: "500",
    },
    token,
  );
  const map = new Map<string, Stats>();
  for (const r of rows) {
    const id = level === "adset" ? r.adset_id : r.campaign_id;
    if (!id) continue;
    map.set(id, {
      spend: num(r.spend),
      impressions: num(r.impressions),
      linkClicks: num(r.inline_link_clicks),
      results: num(r.results?.[0]?.values?.[0]?.value),
      purchases: pickPurchases(r.actions),
      purchaseValue: pickPurchaseValue(r.action_values),
    });
  }
  return map;
}

type Target = {
  id: string;
  name: string;
  level: RuleLevel;
  campaignId: string;
  status: string;
  effective: string;
  dailyBudget: number | null;
};

function targetsFor(structure: ManagedCampaign[], level: RuleLevel): Target[] {
  if (level === "campaign") {
    return structure.map((c) => ({
      id: c.id, name: c.name, level, campaignId: c.id, status: c.status, effective: c.effective_status, dailyBudget: c.daily_budget,
    }));
  }
  return structure.flatMap((c) =>
    c.adsets.map((s) => ({
      id: s.id, name: s.name, level, campaignId: c.id, status: s.status, effective: s.effective_status, dailyBudget: s.daily_budget,
    })),
  );
}

// নিয়মের মাপকাঠির মান আর "যথেষ্ট ডাটা" হিসাবের সংখ্যা
function measure(rule: AdRule, s: Stats | undefined, orders: RuleOrder[]) {
  const st = s ?? { spend: 0, impressions: 0, linkClicks: 0, results: 0, purchases: 0, purchaseValue: 0 };
  const per = (count: number) => (count > 0 ? st.spend / count : st.spend > 0 ? Infinity : null);
  switch (rule.metric) {
    case "cost_per_result":
      return { value: per(st.results), volume: st.results, spend: st.spend };
    case "cost_per_purchase":
      return { value: per(st.purchases), volume: st.purchases, spend: st.spend };
    case "cost_per_order":
      return { value: per(orders.length), volume: orders.length, spend: st.spend };
    case "results":
      return { value: st.results, volume: st.results, spend: st.spend };
    case "roas":
      return { value: st.spend > 0 ? st.purchaseValue / st.spend : null, volume: st.purchases, spend: st.spend };
    case "ctr":
      return { value: st.impressions > 0 ? (st.linkClicks / st.impressions) * 100 : null, volume: st.results, spend: st.spend };
    case "spend":
      return { value: st.spend, volume: st.results, spend: st.spend };
    case "delivery_rate": {
      const done = orders.filter((o) => ["delivered", "cancelled", "returned"].includes(o.status));
      const delivered = done.filter((o) => o.status === "delivered").length;
      return { value: done.length > 0 ? (delivered / done.length) * 100 : null, volume: done.length, spend: st.spend };
    }
  }
}

// WhatsApp-এ ছোট করে দেখানোর জন্য
const METRIC_SHORT: Record<AdRule["metric"], string> = {
  cost_per_result: "প্রতি রেজাল্টে খরচ",
  cost_per_purchase: "প্রতি পারচেজে খরচ",
  cost_per_order: "প্রতি অর্ডারে খরচ",
  results: "রেজাল্ট",
  roas: "ROAS",
  ctr: "CTR %",
  delivery_rate: "ডেলিভারি রেট %",
  spend: "খরচ",
};

const fmt = (v: number | null) => (v === null ? "—" : v === Infinity ? "∞" : (Math.round(v * 100) / 100).toString());

export type RunOptions = {
  token: string;
  accountId: string;
  rules: AdRule[];
  orders: RuleOrder[];
  recentActions: RecentAction[];
  dryRun: boolean;
  now?: Date;
};

export type RunResult = { account: AccountInfo; events: RuleEvent[]; alerts: NewAlert[]; checked: number };

export async function runAccountRules(o: RunOptions): Promise<RunResult> {
  const account = await getAccountInfo(o.token, o.accountId);
  const today = todayIn(account.timezone);
  const events: RuleEvent[] = [];
  const alerts: NewAlert[] = [];
  const rules = o.rules.filter((r) => r.enabled && r.ad_account_id === o.accountId);
  if (rules.length === 0) return { account, events, alerts, checked: 0 };

  const structure = await loadAccountStructure(o.token, o.accountId, account.currency);
  const statsCache = new Map<string, Promise<Map<string, Stats>>>();
  const statsFor = (level: RuleLevel, w: RuleWindow) => {
    const key = `${level}:${w}`;
    if (!statsCache.has(key)) {
      const { since, until } = windowRange(w, today);
      statsCache.set(key, fetchStats(o.token, o.accountId, level, since, until));
    }
    return statsCache.get(key)!;
  };
  const nowMs = (o.now ?? new Date()).getTime();
  const factor = minorFactor(account.currency);
  const cur = account.currency ?? "";
  let checked = 0;

  for (const rule of rules) {
    // অর্ডারের হিসাব Ad Set লেভেলে হয় না
    if (rule.level === "adset" && CAMPAIGN_ONLY_METRICS.has(rule.metric)) continue;
    const stats = await statsFor(rule.level, rule.time_window);
    const { since, until } = windowRange(rule.time_window, today);
    const targets = targetsFor(structure, rule.level).filter(
      (t) => t.effective === "ACTIVE" && (rule.object_ids.length === 0 || rule.object_ids.includes(t.id) || rule.object_ids.includes(t.campaignId)),
    );

    for (const t of targets) {
      checked++;
      const orders = o.orders.filter((x) => x.campaign_id === t.campaignId && x.order_date >= since && x.order_date <= until);
      const m = measure(rule, stats.get(t.id), orders);
      if (m.value === null) continue;
      if (m.spend < rule.min_spend) continue;
      // "রেজাল্ট কম" নিয়মে min_results মানে অন্তত এত রেজাল্ট লাগবে না; অন্য সব নিয়মে লাগবে
      if (rule.metric !== "results" && m.volume < rule.min_results) continue;
      const hit = rule.operator === "gt" ? m.value > rule.threshold : m.value < rule.threshold;
      if (!hit) continue;

      // একই জিনিসে একই নিয়ম cooldown-এর মধ্যে আবার কাজ করে না
      const recent = o.recentActions.some(
        (a) => a.rule_id === rule.id && a.object_id === t.id && nowMs - new Date(a.created_at).getTime() < rule.cooldown_hours * 3600_000,
      );
      if (recent && rule.action !== "notify") continue;

      const base = {
        rule_id: rule.id,
        rule_name: rule.name,
        ad_account_id: o.accountId,
        level: rule.level,
        object_id: t.id,
        object_name: t.name,
        metric_value: Number.isFinite(m.value) ? Math.round(m.value * 10000) / 10000 : null,
      };
      const why = `${METRIC_SHORT[rule.metric]} ${fmt(m.value)} (${rule.operator === "gt" ? "সীমা" : "লক্ষ্য"} ${rule.threshold}) · খরচ ${fmt(m.spend)} ${cur}`;

      if (rule.action === "notify") {
        events.push({ ...base, action: "notify", detail: why, ok: true });
        alerts.push({
          ad_account_id: o.accountId,
          kind: "rule",
          severity: "warning",
          title: `${rule.name}: ${t.name}`,
          body: why,
          // একই নিয়ম-জিনিসের সতর্কতা cooldown সময়ে একবার
          dedupe_key: `rule:${rule.id}:${t.id}:${Math.floor(nowMs / (rule.cooldown_hours * 3600_000))}`,
        });
        continue;
      }

      if (rule.action === "pause") {
        const ev: RuleEvent = { ...base, action: "pause", detail: why, old_value: "ACTIVE", new_value: "PAUSED", ok: true };
        if (!o.dryRun) {
          try {
            await setDeliveryStatus(o.token, t.id, "PAUSED");
          } catch (err) {
            ev.ok = false;
            ev.error = err instanceof MetaApiError || err instanceof Error ? err.message.slice(0, 300) : "error";
          }
        }
        events.push(ev);
        alerts.push({
          ad_account_id: o.accountId,
          kind: "rule_action",
          severity: ev.ok ? "info" : "critical",
          title: ev.ok ? `⏸ বন্ধ করা হয়েছে: ${t.name}` : `বন্ধ করা যায়নি: ${t.name}`,
          body: `${rule.name} · ${why}${ev.error ? ` · ${ev.error}` : ""}`,
          dedupe_key: `act:${rule.id}:${t.id}:${Math.floor(nowMs / 3600_000)}`,
        });
        continue;
      }

      // বাজেট বদল: Ad Set-এর বাজেট বা ক্যাম্পেইন বাজেট (CBO)। লাইফটাইম বাজেটে হাত দেওয়া হয় না।
      const old = t.dailyBudget;
      if (!old) {
        // বাজেট ক্যাম্পেইন লেভেলে (CBO) বা লাইফটাইম; প্রতি ঘণ্টায় ব্যর্থ লগ না জমাতে শুধু পরীক্ষায় দেখানো হয়
        if (o.dryRun) events.push({ ...base, action: rule.action, detail: why, ok: false, error: "no_daily_budget" });
        continue;
      }
      const pct = Math.min(50, rule.action_value ?? 0) / 100;
      let next = rule.action === "increase_budget" ? old * (1 + pct) : old * (1 - pct);
      if (rule.action === "increase_budget" && rule.max_budget) next = Math.min(next, rule.max_budget);
      next = Math.round(next * 100) / 100;
      if (rule.action === "increase_budget" && next <= old) {
        continue; // সর্বোচ্চ বাজেটে পৌঁছে গেছে
      }
      if (next <= 0) continue;
      const ev: RuleEvent = {
        ...base,
        action: rule.action,
        detail: why,
        old_value: old.toFixed(2),
        new_value: next.toFixed(2),
        ok: true,
      };
      if (!o.dryRun) {
        try {
          await setDailyBudget(o.token, t.id, next * factor);
        } catch (err) {
          ev.ok = false;
          ev.error = err instanceof MetaApiError || err instanceof Error ? err.message.slice(0, 300) : "error";
        }
      }
      events.push(ev);
      alerts.push({
        ad_account_id: o.accountId,
        kind: "rule_action",
        severity: ev.ok ? "info" : "critical",
        title: ev.ok
          ? `${rule.action === "increase_budget" ? "📈" : "📉"} বাজেট ${old.toFixed(2)} → ${next.toFixed(2)} ${cur}: ${t.name}`
          : `বাজেট বদলানো যায়নি: ${t.name}`,
        body: `${rule.name} · ${why}${ev.error ? ` · ${ev.error}` : ""}`,
        dedupe_key: `act:${rule.id}:${t.id}:${Math.floor(nowMs / 3600_000)}`,
      });
    }
  }
  return { account, events, alerts, checked };
}
