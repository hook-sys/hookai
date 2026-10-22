import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Eye,
  Link2Off,
  ListChecks,
  MousePointerClick,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Tag,
  TimerOff,
  TrendingUp,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
import AppShell from "@/components/AppShell";
import {
  Badge,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  buttonClass,
  cn,
} from "@/components/ui";
import { refreshInsights } from "./actions";

export const metadata = { title: "ড্যাশবোর্ড" };

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const STATUS_MESSAGES: Record<string, { text: string; tone: "success" | "danger" }> = {
  refreshed: { text: "ডাটা রিফ্রেশ হয়েছে।", tone: "success" },
  refresh_error: {
    text: "Meta থেকে ডাটা আনা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।",
    tone: "danger",
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

// ROAS ২ বা তার বেশি ভালো, ১-২ মাঝারি, ১-এর কম মানে খরচের চেয়ে কম বিক্রি
function roasTone(roas: number | null) {
  if (roas === null) return "neutral" as const;
  if (roas >= 2) return "success" as const;
  if (roas >= 1) return "warning" as const;
  return "danger" as const;
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </Card>
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

  const settingsButton = (label: string) => (
    <Link href="/settings" className={buttonClass("primary")}>
      {label}
    </Link>
  );

  if (!connection || expired || !connection.selected_ad_account_id) {
    const empty = !connection
      ? {
          icon: Link2Off,
          title: "Meta অ্যাকাউন্ট কানেক্ট করা নেই",
          text: "বিজ্ঞাপনের হিসাব দেখতে প্রথমে তোমার Meta অ্যাকাউন্ট কানেক্ট করো।",
          cta: "কানেক্ট করতে সেটিংসে যাও",
        }
      : expired
        ? {
            icon: TimerOff,
            title: "Meta সংযোগের মেয়াদ শেষ",
            text: "নিরাপত্তার জন্য Meta সংযোগ কিছুদিন পর পর নবায়ন করতে হয়। সেটিংস থেকে আবার কানেক্ট করো।",
            cta: "আবার কানেক্ট করো",
          }
        : {
            icon: ListChecks,
            title: "Ad Account বেছে নাও",
            text: "কোন Ad Account-এর হিসাব দেখবে সেটি সেটিংস থেকে বেছে নাও।",
            cta: "Ad Account বেছে নাও",
          };

    return (
      <AppShell active="dashboard">
        <PageHeader title="ড্যাশবোর্ড" />
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          text={empty.text}
          action={settingsButton(empty.cta)}
        />
      </AppShell>
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

  const rangePicker = (
    <nav
      aria-label="সময়সীমা"
      className="flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/dashboard?range=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            r === range
              ? "bg-indigo-600 text-white dark:bg-indigo-500"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
          )}
        >
          {r} দিন
        </Link>
      ))}
    </nav>
  );

  const refreshButton = (
    <form action={refreshInsights}>
      <input type="hidden" name="range" value={range} />
      <button type="submit" className={buttonClass("secondary")}>
        <RefreshCw className="size-4" aria-hidden />
        রিফ্রেশ
      </button>
    </form>
  );

  return (
    <AppShell active="dashboard">
      <PageHeader
        title={accountName ?? accountId}
        description={
          <>
            <span className="font-mono text-xs">{accountId}</span> · গত {range} দিন ({since}{" "}
            থেকে {until}, আজ বাদে)
          </>
        }
        actions={
          <>
            {rangePicker}
            {refreshButton}
          </>
        }
      />

      {syncError && <Notice tone="warning">{syncError}</Notice>}
      {!syncError && status && <Notice tone={status.tone}>{status.text}</Notice>}

      <section aria-label="মূল হিসাব" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="খরচ" value={money(total.spend)} />
        <Kpi icon={ShoppingCart} label="Purchase" value={formatNumber(total.purchases)} />
        <Kpi icon={Receipt} label="Cost per Purchase" value={money(m.costPerPurchase)} />
        <Kpi
          icon={TrendingUp}
          label="ROAS"
          value={formatRoas(m.roas)}
          hint={`Purchase মূল্য ${money(total.purchaseValue)}`}
        />
        <Kpi icon={UserPlus} label="Lead" value={formatNumber(total.leads)} />
        <Kpi icon={Tag} label="Cost per Lead" value={money(m.costPerLead)} />
        <Kpi
          icon={MousePointerClick}
          label="CTR"
          value={formatPercent(m.ctr)}
          hint={`${formatNumber(total.clicks)} ক্লিক`}
        />
        <Kpi
          icon={Eye}
          label="CPM"
          value={money(m.cpm)}
          hint={`${formatNumber(total.impressions)} impression`}
        />
      </section>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">ক্যাম্পেইন</h2>
          <Badge>{campaigns.length}টি সক্রিয়</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-5 py-3">ক্যাম্পেইন</th>
                <th scope="col" className="px-3 py-3 text-right">খরচ</th>
                <th scope="col" className="px-3 py-3 text-right">Purchase</th>
                <th scope="col" className="px-3 py-3 text-right">Cost/Purchase</th>
                <th scope="col" className="px-3 py-3 text-right">ROAS</th>
                <th scope="col" className="px-3 py-3 text-right">Lead</th>
                <th scope="col" className="px-3 py-3 text-right">Cost/Lead</th>
                <th scope="col" className="px-3 py-3 text-right">CTR</th>
                <th scope="col" className="px-5 py-3 text-right">CPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-zinc-500">
                    এই সময়ে কোনো ক্যাম্পেইনে খরচ হয়নি।
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.id} className="tabular-nums hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td
                    className="max-w-xs truncate px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100"
                    title={c.name}
                  >
                    {c.name}
                  </td>
                  <td className="px-3 py-3 text-right">{money(c.totals.spend)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(c.totals.purchases)}</td>
                  <td className="px-3 py-3 text-right">{money(c.m.costPerPurchase)}</td>
                  <td className="px-3 py-3 text-right">
                    <Badge tone={roasTone(c.m.roas)}>{formatRoas(c.m.roas)}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right">{formatNumber(c.totals.leads)}</td>
                  <td className="px-3 py-3 text-right">{money(c.m.costPerLead)}</td>
                  <td className="px-3 py-3 text-right">{formatPercent(c.m.ctr)}</td>
                  <td className="px-5 py-3 text-right">{money(c.m.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        শেষ আপডেট: {syncedAt ? new Date(syncedAt).toLocaleString("en-GB") : "—"} · ডাটা
        প্রতি ৬ ঘণ্টায় নিজে থেকে আপডেট হয়
      </p>
    </AppShell>
  );
}
