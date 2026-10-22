import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { STALE_AFTER_MS, syncInsights } from "@/lib/insights/sync";
import {
  addTotals,
  deriveMetrics,
  emptyTotals,
  type Totals,
} from "@/lib/metrics";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
} from "@/lib/format";
import AppHeader from "@/components/AppHeader";
import { refreshInsights } from "./actions";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const STATUS_MESSAGES: Record<string, { text: string; tone: string }> = {
  refreshed: { text: "ডাটা রিফ্রেশ হয়েছে।", tone: "text-emerald-600" },
  refresh_error: {
    text: "Meta থেকে ডাটা আনা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।",
    tone: "text-red-600",
  },
};

type InsightRow = {
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  leads: number;
};

// UTC তারিখ YYYY-MM-DD
function isoDate(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Supabase এক কোয়েরিতে সর্বোচ্চ ১০০০ সারি দেয়, তাই পাতায় পাতায় আনা হয়
const PAGE = 1000;

async function loadInsights(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  since: string,
  until: string,
) {
  const rows: InsightRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ad_insights_daily")
      .select(
        "campaign_id, campaign_name, spend, impressions, clicks, purchases, purchase_value, leads",
      )
      .eq("user_id", userId)
      .eq("ad_account_id", accountId)
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true })
      .order("campaign_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as InsightRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function toTotals(r: InsightRow): Totals {
  return {
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    purchases: Number(r.purchases),
    purchaseValue: Number(r.purchase_value),
    leads: Number(r.leads),
  };
}

function MessageCard({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <section className="max-w-xl rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900">
      <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">{text}</p>
      <Link
        href={href}
        className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        {cta}
      </Link>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

type Props = { searchParams: Promise<{ range?: string; status?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const range: Range = RANGES.includes(Number(params.range) as Range)
    ? (Number(params.range) as Range)
    : 7;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware সাধারণত আটকায়, তবে Supabase-এ সাময়িক সমস্যা হলেও যেন পেজ না ভাঙে
  if (!user) {
    redirect("/login");
  }

  const { data: connection } = await supabase
    .from("meta_connections")
    .select(
      "access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, insights_synced_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const expired =
    connection?.token_expires_at &&
    new Date(connection.token_expires_at) < new Date();

  const header = <AppHeader active="dashboard" />;
  const wrap = (body: ReactNode) => (
    <main className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      {header}
      {body}
    </main>
  );

  if (!connection) {
    return wrap(
      <MessageCard
        text="বিজ্ঞাপনের হিসাব দেখতে প্রথমে তোমার Meta অ্যাকাউন্ট কানেক্ট করো।"
        href="/settings"
        cta="সেটিংসে যাও"
      />,
    );
  }
  if (expired) {
    return wrap(
      <MessageCard
        text="Meta সংযোগের মেয়াদ শেষ হয়ে গেছে। সেটিংস থেকে আবার কানেক্ট করো।"
        href="/settings"
        cta="সেটিংসে যাও"
      />,
    );
  }
  if (!connection.selected_ad_account_id) {
    return wrap(
      <MessageCard
        text="কোন Ad Account-এর হিসাব দেখবে সেটি সেটিংস থেকে বেছে নাও।"
        href="/settings"
        cta="Ad Account বেছে নাও"
      />,
    );
  }

  const accountId = connection.selected_ad_account_id;
  let currency = connection.selected_ad_account_currency;
  let accountName = connection.selected_ad_account_name;
  let syncedAt = connection.insights_synced_at;
  let syncError: string | null = null;

  // ডাটা না থাকলে বা পুরনো হলে খোলার সময়ই Meta থেকে নতুন করে আনে
  const stale =
    !syncedAt || Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS;
  if (stale) {
    try {
      await syncInsights(
        supabase,
        user.id,
        decrypt(connection.access_token_encrypted),
        accountId,
      );
      const { data: fresh } = await supabase
        .from("meta_connections")
        .select("selected_ad_account_name, selected_ad_account_currency, insights_synced_at")
        .eq("user_id", user.id)
        .maybeSingle();
      currency = fresh?.selected_ad_account_currency ?? currency;
      accountName = fresh?.selected_ad_account_name ?? accountName;
      syncedAt = fresh?.insights_synced_at ?? syncedAt;
    } catch (err) {
      console.error("auto sync failed", err instanceof Error ? err.message : err);
      syncError = "Meta থেকে নতুন ডাটা আনা যায়নি। সংরক্ষিত ডাটা দেখানো হচ্ছে।";
    }
  }

  // গত N দিন, আজ বাদে (আজকের ডাটা এখনো অসম্পূর্ণ)
  const since = isoDate(range);
  const until = isoDate(1);
  const rows = await loadInsights(supabase, user.id, accountId, since, until);

  const byCampaign = new Map<string, { name: string; totals: Totals }>();
  let total = emptyTotals();
  for (const r of rows) {
    const t = toTotals(r);
    total = addTotals(total, t);
    const entry = byCampaign.get(r.campaign_id) ?? {
      name: r.campaign_name ?? r.campaign_id,
      totals: emptyTotals(),
    };
    entry.totals = addTotals(entry.totals, t);
    byCampaign.set(r.campaign_id, entry);
  }

  const m = deriveMetrics(total);
  const campaigns = [...byCampaign.entries()]
    .map(([id, c]) => ({ id, name: c.name, totals: c.totals, m: deriveMetrics(c.totals) }))
    .filter((c) => c.totals.spend > 0 || c.totals.impressions > 0)
    .sort((a, b) => b.totals.spend - a.totals.spend);

  const money = (v: number | null) => formatMoney(v, currency);
  const status = params.status ? STATUS_MESSAGES[params.status] : undefined;

  return wrap(
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {accountName ?? accountId}
          </h1>
          <p className="text-sm text-zinc-500">
            {accountId} · গত {range} দিন ({since} থেকে {until}, আজ বাদে)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-1 rounded-lg bg-white p-1 shadow-sm dark:bg-zinc-900">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/dashboard?range=${r}`}
                className={`rounded-md px-3 py-1 text-sm ${
                  r === range
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {r} দিন
              </Link>
            ))}
          </nav>
          <form action={refreshInsights}>
            <input type="hidden" name="range" value={range} />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              ডাটা রিফ্রেশ
            </button>
          </form>
        </div>
      </div>

      {(status || syncError) && (
        <p className={`text-sm ${syncError ? "text-amber-600" : status?.tone}`}>
          {syncError ?? status?.text}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="খরচ (Spend)" value={money(total.spend)} />
        <Kpi label="Purchase" value={formatNumber(total.purchases)} />
        <Kpi label="Cost per Purchase" value={money(m.costPerPurchase)} />
        <Kpi label="ROAS" value={formatRoas(m.roas)} hint={`Purchase মূল্য ${money(total.purchaseValue)}`} />
        <Kpi label="Lead" value={formatNumber(total.leads)} />
        <Kpi label="Cost per Lead" value={money(m.costPerLead)} />
        <Kpi label="CTR" value={formatPercent(m.ctr)} hint={`${formatNumber(total.clicks)} ক্লিক`} />
        <Kpi label="CPM" value={money(m.cpm)} hint={`${formatNumber(total.impressions)} impression`} />
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="p-3 font-medium">ক্যাম্পেইন</th>
              <th className="p-3 text-right font-medium">খরচ</th>
              <th className="p-3 text-right font-medium">Purchase</th>
              <th className="p-3 text-right font-medium">Cost/Purchase</th>
              <th className="p-3 text-right font-medium">ROAS</th>
              <th className="p-3 text-right font-medium">Lead</th>
              <th className="p-3 text-right font-medium">Cost/Lead</th>
              <th className="p-3 text-right font-medium">CTR</th>
              <th className="p-3 text-right font-medium">CPC</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-zinc-500">
                  এই সময়ে কোনো ক্যাম্পেইনে খরচ হয়নি।
                </td>
              </tr>
            )}
            {campaigns.map((c) => (
              <tr
                key={c.id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td className="max-w-xs truncate p-3 text-zinc-900 dark:text-zinc-100" title={c.name}>
                  {c.name}
                </td>
                <td className="p-3 text-right tabular-nums">{money(c.totals.spend)}</td>
                <td className="p-3 text-right tabular-nums">{formatNumber(c.totals.purchases)}</td>
                <td className="p-3 text-right tabular-nums">{money(c.m.costPerPurchase)}</td>
                <td className="p-3 text-right tabular-nums">{formatRoas(c.m.roas)}</td>
                <td className="p-3 text-right tabular-nums">{formatNumber(c.totals.leads)}</td>
                <td className="p-3 text-right tabular-nums">{money(c.m.costPerLead)}</td>
                <td className="p-3 text-right tabular-nums">{formatPercent(c.m.ctr)}</td>
                <td className="p-3 text-right tabular-nums">{money(c.m.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-400">
        শেষ আপডেট: {syncedAt ? new Date(syncedAt).toLocaleString("en-GB") : "—"} ·
        ডাটা প্রতি ৬ ঘণ্টায় নিজে থেকে আপডেট হয়
      </p>
    </div>,
  );
}
