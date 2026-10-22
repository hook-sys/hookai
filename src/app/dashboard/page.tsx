import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Link2Off, ListChecks, RefreshCw, TimerOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import {
  STALE_AFTER_MS,
  TODAY_STALE_MS,
  ensureCoverage,
  syncRecent,
  syncToday,
} from "@/lib/insights/sync";
import { buildPeriodReport, earliestDataDate, findDataWarnings } from "@/lib/insights/report";
import {
  indicatorLabel,
  loadBreakdown,
  loadLiveReport,
  type BreakdownRow,
  type LiveReport,
} from "@/lib/insights/live";
import { isBreakdownId, type BreakdownId } from "@/lib/meta/rangeInsights";
import {
  addDays,
  daysInRange,
  formatRange,
  minAllowedDate,
  previousRange,
  rangeQuery,
  resolveRange,
  todayIn,
} from "@/lib/dates";
import { getLatestSummary } from "@/lib/ai/summary";
import { getActiveAlerts } from "@/lib/alerts/store";
import AppShell from "@/components/AppShell";
import { Card, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";
import { refreshInsights } from "./actions";
import AiSummaryCard from "./AiSummaryCard";
import AlertsCard from "./AlertsCard";
import DateRangePicker from "./DateRangePicker";
import {
  BreakdownSection,
  CampaignTable,
  FunnelCard,
  KpiGrid,
  ViewTabs,
  kpisFor,
  parseView,
  videoFunnel,
  websiteFunnel,
  type ViewId,
} from "./views";

export const metadata = { title: "ড্যাশবোর্ড" };

// AI সারসংক্ষেপ বা পুরনো ডাটা আনতে কখনো এক মিনিটের বেশি লাগতে পারে
export const maxDuration = 120;

const STATUS_MESSAGES: Record<string, { text: string; tone: "success" | "danger" }> = {
  refreshed: { text: "ডাটা রিফ্রেশ হয়েছে।", tone: "success" },
  refresh_error: {
    text: "Meta থেকে ডাটা আনা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।",
    tone: "danger",
  },
};

type Props = {
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    view?: string;
    bd?: string;
    status?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = parseView(params.view);

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
      "access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, selected_ad_account_timezone, insights_synced_at, insights_synced_from, insights_today_synced_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const expired =
    connection?.token_expires_at && new Date(connection.token_expires_at) < new Date();

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
          action={
            <Link href="/settings" className={buttonClass("primary")}>
              {empty.cta}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const accountId = connection.selected_ad_account_id;
  let currency = connection.selected_ad_account_currency;
  let accountName = connection.selected_ad_account_name;
  let timeZone = connection.selected_ad_account_timezone;
  let syncedAt = connection.insights_synced_at;
  let syncedFrom = connection.insights_synced_from;
  let syncError: string | null = null;

  const ctx = {
    supabase,
    userId: user.id,
    token: decrypt(connection.access_token_encrypted),
    accountId,
  };

  // দিনভিত্তিক ডাটা (অ্যালার্ট, AI ও তুলনার জন্য): না থাকলে বা পুরনো হলে নতুন করে আনে
  const stale =
    !syncedAt || !timeZone || Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS;
  let todayFresh = false;
  if (stale) {
    try {
      const { account } = await syncRecent(ctx, syncedFrom);
      currency = account.currency;
      accountName = account.name;
      timeZone = account.timezone_name;
      syncedAt = new Date().toISOString();
      const t = todayIn(timeZone);
      syncedFrom = syncedFrom && syncedFrom < addDays(t, -30) ? syncedFrom : addDays(t, -30);
      todayFresh = true;
    } catch (err) {
      console.error("auto sync failed", err instanceof Error ? err.message : err);
      syncError = "Meta থেকে নতুন ডাটা আনা যায়নি। সংরক্ষিত ডাটা দেখানো হচ্ছে।";
    }
  }

  const today = todayIn(timeZone);
  const minDate = minAllowedDate(today);
  const range = resolveRange(
    { preset: params.preset, since: params.since, until: params.until || params.since },
    today,
  );
  const isMaximum = range.preset === "maximum";

  if (!syncError) {
    try {
      // পুরনো তারিখ বাছলে ডাটাবেসে না থাকা অংশ Meta থেকে আনে
      if (await ensureCoverage(ctx, isMaximum ? minDate : range.since, syncedFrom, timeZone)) {
        syncedFrom = isMaximum ? minDate : range.since;
      }
      // আজ বা গতকাল দেখলে এই দুই দিন ঘন ঘন আপডেট হয়
      const recentStale =
        !connection.insights_today_synced_at ||
        Date.now() - new Date(connection.insights_today_synced_at).getTime() > TODAY_STALE_MS;
      if (!todayFresh && range.until >= addDays(today, -1) && recentStale) {
        await syncToday(ctx, timeZone);
      }
    } catch (err) {
      console.error("range sync failed", err instanceof Error ? err.message : err);
      syncError = "এই তারিখের সব ডাটা Meta থেকে আনা যায়নি। যা আছে তা দেখানো হচ্ছে।";
    }
  }

  // "সর্বোচ্চ" মানে ডাটাবেসে থাকা সবচেয়ে পুরনো দিন থেকে আজ পর্যন্ত
  const since = isMaximum
    ? ((await earliestDataDate(supabase, user.id, accountId)) ?? today)
    : range.since;
  const until = range.until;
  // আজ অসম্পূর্ণ দিন, তাই আজকে-সহ ছোট সময়কে পুরো আগের দিনের সাথে তুলনা করলে ভুল ছবি আসে
  const compare = !isMaximum && !(until >= today && daysInRange(since, until) < 7);
  const prevRange = previousRange(since, until);
  const breakdown: BreakdownId = isBreakdownId(params.bd) ? params.bd : "placement";

  // Reach, Frequency, Result, বাজেট ও ব্রেকডাউন সরাসরি Meta থেকে (Ads Manager-এর সাথে মেলে)
  let live: LiveReport | null = null;
  let livePrev: LiveReport | null = null;
  let breakdownRows: BreakdownRow[] = [];
  let liveError: string | null = null;
  try {
    [live, livePrev] = await Promise.all([
      loadLiveReport(ctx, { since, until }, today, currency),
      compare ? loadLiveReport(ctx, prevRange, today, currency) : Promise.resolve(null),
    ]);
    if (view === "insights") {
      breakdownRows = await loadBreakdown(ctx, { since, until }, today, breakdown, live.primaryIndicator);
    }
  } catch (err) {
    console.error("live insights failed", err instanceof Error ? err.message : err);
    liveError = "Meta থেকে এই তারিখের বিস্তারিত হিসাব আনা যায়নি। কিছুক্ষণ পরে রিফ্রেশ করো।";
  }

  const [report, latestSummary, alerts] = await Promise.all([
    buildPeriodReport(supabase, user.id, accountId, { since, until }, { compare, dataFrom: syncedFrom }),
    getLatestSummary(supabase, user.id, accountId, { since, until }),
    getActiveAlerts(supabase, user.id, accountId, timeZone),
  ]);
  const warnings = findDataWarnings(report.current);

  const status = params.status ? STATUS_MESSAGES[params.status] : undefined;
  const changeLabel = report.days === 1 ? "আগের দিনের তুলনায়" : `আগের ${report.days} দিনের তুলনায়`;
  const includesToday = until >= today;

  // তারিখ ঠিক রেখে ভিউ বা ব্রেকডাউন বদলানোর লিংক
  const dateQuery = rangeQuery(range);
  const href = (v: ViewId, bd?: BreakdownId) =>
    `/dashboard?${dateQuery}&view=${v}${bd ? `&bd=${bd}` : ""}`;
  const keepParams = { view, ...(view === "insights" ? { bd: breakdown } : {}) };

  const refreshButton = (
    <form action={refreshInsights}>
      {range.preset === "custom" ? (
        <>
          <input type="hidden" name="since" value={range.since} />
          <input type="hidden" name="until" value={range.until} />
        </>
      ) : (
        <input type="hidden" name="preset" value={range.preset} />
      )}
      {Object.entries(keepParams).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
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
            <span className="font-mono text-xs">{accountId}</span> · {range.label}:{" "}
            {formatRange(since, until)} ({report.days} দিন)
            {includesToday && " · আজকের ডাটা এখনো চলমান"}
          </>
        }
        actions={
          <>
            <DateRangePicker
              key={`${range.preset}-${since}-${until}`}
              preset={range.preset}
              label={range.label}
              since={since}
              until={until}
              today={today}
              minDate={minDate}
              keepParams={keepParams}
            />
            {refreshButton}
          </>
        }
      />

      {syncError && <Notice tone="warning">{syncError}</Notice>}
      {!syncError && status && <Notice tone={status.tone}>{status.text}</Notice>}

      <AlertsCard alerts={alerts} />

      <AiSummaryCard
        key={`${since}-${until}`}
        initial={latestSummary}
        since={since}
        until={until}
        periodLabel={range.preset === "custom" ? formatRange(since, until) : range.label}
        compare={compare}
      />

      {warnings.length > 0 && (
        <Card className="mb-6 border-amber-200 dark:border-amber-900">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="size-4" aria-hidden />
            ডাটায় সমস্যা আছে, কিছু সংখ্যা ভুল হতে পারে
          </div>
          <ul className="flex flex-col gap-4 px-5 py-4">
            {warnings.map((w) => (
              <li key={w.title} className="text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{w.title}</p>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{w.detail}</p>
                <p className="mt-1 text-xs text-zinc-500">ক্যাম্পেইন: {w.campaigns.join(", ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ViewTabs view={view} hrefFor={(v) => href(v, v === "insights" ? breakdown : undefined)} />

      {liveError && <Notice tone="warning">{liveError}</Notice>}

      {live && (
        <>
          <KpiGrid
            defs={kpisFor(view)}
            report={live}
            previous={livePrev}
            currency={currency}
            changeLabel={changeLabel}
          />

          {view === "video" && (
            <FunnelCard title="ভিডিও কতটা দেখা হচ্ছে" steps={videoFunnel(live.account)} />
          )}
          {view === "website" && (
            <FunnelCard title="ওয়েবসাইটে কেনাকাটার ধাপ" steps={websiteFunnel(live.account)} />
          )}
          {view === "insights" && (
            <BreakdownSection
              breakdown={breakdown}
              rows={breakdownRows}
              resultLabel={indicatorLabel(live.primaryIndicator)}
              currency={currency}
              hrefFor={(bd) => href("insights", bd)}
            />
          )}

          <CampaignTable view={view} campaigns={live.campaigns} currency={currency} />
        </>
      )}

      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        শেষ আপডেট: {syncedAt ? new Date(syncedAt).toLocaleString("en-GB") : "—"} · Reach,
        Frequency, Result ও ব্রেকডাউন সরাসরি Meta থেকে (আজ/গতকাল ১৫ মিনিট, পুরনো তারিখ ৬ ঘণ্টা পর পর নতুন)
      </p>
    </AppShell>
  );
}
