import Link from "next/link";
import { ArrowLeft, CalendarX, Lock } from "lucide-react";
import { loadCampaignAnalysis, type DimensionAnalysis, type Segment } from "@/lib/insights/campaign";
import type { LiveReport } from "@/lib/insights/live";
import { getLatestReport, getTodaysReport } from "@/lib/ai/campaignReport";
import { formatRange, rangeQuery } from "@/lib/dates";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import AppShell from "@/components/AppShell";
import type { Tr } from "@/lib/i18n";
import { Badge, Card, EmptyState, PageHeader, buttonClass, cn } from "@/components/ui";
import DateRangePicker from "../../DateRangePicker";
import { FunnelCard, KpiGrid, kpisFor, videoFunnel, websiteFunnel } from "../../views";
import { loadCampaignContext } from "./load";
import ReportCard from "./ReportCard";

export const metadata = { title: "Campaign analysis" };

// AI রিপোর্টে কখনো এক মিনিটের বেশি লাগে
export const maxDuration = 120;

function SegmentCard({ dim, currency, tr }: { dim: DimensionAnalysis; currency: string | null; tr: Tr }) {
  const tone = (s: Segment) =>
    s === dim.best ? "success" : s === dim.worst ? "danger" : ("neutral" as const);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{dim.label}</h3>
        {dim.best && <Badge tone="success">{tr("Best", "সেরা")}: {dim.best.label}</Badge>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-2">{dim.label}</th>
              <th scope="col" className="px-2 py-2 text-right">{tr("Share of spend", "খরচের ভাগ")}</th>
              <th scope="col" className="px-2 py-2 text-right">Result</th>
              <th scope="col" className="px-2 py-2 text-right">Cost/Result</th>
              <th scope="col" className="px-4 py-2 text-right">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
            {dim.segments.slice(0, 8).map((s) => (
              <tr key={s.key}>
                <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">{s.label}</td>
                <td className="px-2 py-2 text-right">{formatPercent(s.share)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(s.results)}</td>
                <td className="px-2 py-2 text-right">
                  <Badge tone={tone(s)}>{s.cpr === null ? "—" : formatMoney(s.cpr, currency)}</Badge>
                </td>
                <td className="px-4 py-2 text-right">{formatPercent(s.ctr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!dim.resultsAvailable && (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-300">
          {tr("Meta doesn't report results for this split; use spend and CTR.", "Meta এই ভাগে Result দেখায় না; খরচ ও CTR দেখো।")}
        </p>
      )}
    </Card>
  );
}

// ২৪ ঘণ্টার কোন সময়ে Result বেশি আসে (Result না থাকলে খরচ)
function HourChart({ dim, currency, tr }: { dim: DimensionAnalysis; currency: string | null; tr: Tr }) {
  const useResults = dim.resultsAvailable;
  const hours = Array.from({ length: 24 }, (_, h) => {
    const key = String(h).padStart(2, "0");
    return dim.segments.find((s) => s.key.startsWith(key)) ?? null;
  });
  const value = (s: Segment | null) => (s ? (useResults ? (s.results ?? 0) : s.spend) : 0);
  const max = Math.max(...hours.map(value), 1);

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {useResults
            ? tr("When results come in", "দিনের কোন সময়ে Result আসে")
            : tr("When money is spent", "দিনের কোন সময়ে খরচ হয়")}
        </h3>
        {dim.best && (
          <Badge tone="success">
            {tr("Cheapest", "সবচেয়ে কম খরচে")}: {dim.best.label} ({formatMoney(dim.best.cpr, currency)})
          </Badge>
        )}
      </div>
      <div className="flex h-40 items-end gap-1" role="img" aria-label={tr("Chart by hour", "ঘণ্টা অনুযায়ী চার্ট")}>
        {hours.map((s, h) => (
          <div key={h} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className={cn(
                "w-full rounded-t",
                s && s === dim.best ? "bg-emerald-500" : "bg-indigo-500 dark:bg-indigo-400",
              )}
              style={{ height: `${(value(s) / max) * 100}%`, minHeight: value(s) > 0 ? 2 : 0 }}
              title={
                s
                  ? tr(
                      `${s.label}: ${formatNumber(s.results)} results, ${formatMoney(s.spend, currency)} spent`,
                      `${s.label}: ${formatNumber(s.results)} Result, খরচ ${formatMoney(s.spend, currency)}`,
                    )
                  : tr(`${h}:00 — no data`, `${h}:00 — কোনো ডাটা নেই`)
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{tr("12 AM", "রাত ১২টা")}</span>
        <span>{tr("6 AM", "সকাল ৬টা")}</span>
        <span>{tr("12 PM", "দুপুর ১২টা")}</span>
        <span>{tr("6 PM", "সন্ধ্যা ৬টা")}</span>
        <span>{tr("11 PM", "রাত ১১টা")}</span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {tr("Times are in the ad account's time zone. Green bar = cheapest results.", "সময় Ad Account-এর টাইমজোনে। সবুজ দণ্ড = সবচেয়ে কম খরচে Result।")}
      </p>
    </Card>
  );
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preset?: string; since?: string; until?: string }>;
};

export default async function CampaignPage({ params, searchParams }: Props) {
  const { id } = await params;
  const c = await loadCampaignContext(id, await searchParams);
  const tr = c.tr;
  const dateQuery = rangeQuery(c.range);
  const basePath = `/dashboard/campaigns/${id}`;

  const back = (
    <Link
      href={`/dashboard?${dateQuery}`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {tr("Back to dashboard", "ড্যাশবোর্ডে ফিরে যাও")}
    </Link>
  );

  const picker = (
    <DateRangePicker
      key={`${c.range.preset}-${c.since}-${c.until}`}
      preset={c.range.preset}
      label={c.range.label}
      since={c.since}
      until={c.until}
      today={c.today}
      minDate={c.minDate}
      keepParams={{}}
      basePath={basePath}
    />
  );

  if (!c.campaign) {
    return (
      <AppShell active="dashboard">
        {back}
        <PageHeader title={c.info.name} actions={picker} />
        <EmptyState
          icon={CalendarX}
          title={tr("Nothing spent in this period", "এই সময়ে কোনো খরচ হয়নি")}
          text={tr("Pick another range, such as the last 30 days or Maximum.", "অন্য তারিখ বেছে নাও, যেমন গত ৩০ দিন বা সর্বোচ্চ।")}
        />
      </AppShell>
    );
  }

  if (c.overLimit) {
    return (
      <AppShell active="dashboard">
        {back}
        <PageHeader title={c.info.name} actions={picker} />
        <EmptyState
          icon={Lock}
          title={tr("Outside your plan's campaign limit", "তোমার প্ল্যানের ক্যাম্পেইন সীমার বাইরে")}
          text={tr(
            `The ${c.plan.name} plan analyzes your top ${c.plan.activeCampaigns} campaigns by spend in the selected period. Upgrade to analyze more.`,
            `${c.plan.name} প্ল্যানে বাছাই করা সময়ে খরচে সবচেয়ে বড় ${c.plan.activeCampaigns}টি ক্যাম্পেইন বিশ্লেষণ করা যায়। আরও লাগলে প্ল্যান বাড়াও।`,
          )}
          action={
            <Link href="/settings#plan" className={buttonClass("primary")}>
              {tr("See plans", "প্ল্যান দেখো")}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const campaign = c.campaign;
  const [analysis, todays, latest] = await Promise.all([
    loadCampaignAnalysis(c.ctx, campaign, { since: c.since, until: c.until }, c.today, tr),
    getTodaysReport(c.supabase, c.user.id, id, c.today),
    getLatestReport(c.supabase, c.user.id, id),
  ]);

  // KPI কার্ড পুনরায় ব্যবহারের জন্য ক্যাম্পেইনকে অ্যাকাউন্টের মতো আকারে
  const asReport: LiveReport = {
    account: campaign,
    campaigns: [campaign],
    primaryIndicator: campaign.resultIndicator,
    primaryResults: campaign.results,
    primarySpend: campaign.spend,
    otherResults: [],
    budgetDaily: campaign.budget?.daily ?? 0,
    budgetLifetime: campaign.budget?.lifetime ?? 0,
  };

  const hour = analysis.dimensions.find((d) => d.id === "hour");
  const others = analysis.dimensions.filter((d) => d.id !== "hour");
  const hasVideo = campaign.video.views3s > 0 || campaign.video.plays > 0;
  const hasWebsite = campaign.web.linkClicks > 0;

  return (
    <AppShell active="dashboard">
      {back}
      <PageHeader
        title={campaign.name}
        description={
          <>
            {tr("Campaign analysis", "ক্যাম্পেইন বিশ্লেষণ")} · {c.range.label}: {formatRange(c.since, c.until)} · Result:{" "}
            {analysis.resultLabel}
          </>
        }
        actions={picker}
      />

      <ReportCard campaignId={id} since={c.since} until={c.until} todays={todays} latest={latest} />

      <KpiGrid defs={kpisFor("regular", tr)} report={asReport} previous={null} currency={c.currency} changeLabel="" tr={tr} />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {tr("Who, where and when: audience breakdown", "কে, কোথায়, কখন: অডিয়েন্স বিশ্লেষণ")}
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {hour && <HourChart dim={hour} currency={c.currency} tr={tr} />}
        {others.map((d) => (
          <SegmentCard key={d.id} dim={d} currency={c.currency} tr={tr} />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {tr(
          "Green = cheapest results, red = most expensive or spending with no results (among splits with more than 5% of spend).",
          "সবুজ = সবচেয়ে কম খরচে Result, লাল = সবচেয়ে বেশি খরচ বা খরচ হয়েও Result নেই (মোট খরচের ৫%-এর বেশি এমন অংশের মধ্যে)।",
        )}
      </p>

      {hasVideo && (
        <FunnelCard title={tr("Where viewers leave the video", "ভিডিওতে কোথায় মানুষ চলে যাচ্ছে")} steps={videoFunnel(campaign, tr)} tr={tr} />
      )}
      {hasWebsite && (
        <FunnelCard title={tr("Where visitors leave the website", "ওয়েবসাইটে কোন ধাপে মানুষ চলে যাচ্ছে")} steps={websiteFunnel(campaign, tr)} tr={tr} />
      )}
    </AppShell>
  );
}
