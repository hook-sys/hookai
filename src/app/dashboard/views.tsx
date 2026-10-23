import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clapperboard,
  Coins,
  Eye,
  Filter,
  Gauge,
  Globe,
  LayoutGrid,
  MousePointerClick,
  PieChart,
  PlayCircle,
  Repeat,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  indicatorLabel,
  type BreakdownRow,
  type LiveCampaign,
  type LiveReport,
  type LiveStats,
} from "@/lib/insights/live";
import { BREAKDOWNS, type BreakdownId } from "@/lib/meta/rangeInsights";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "@/lib/format";
import type { Tr } from "@/lib/i18n";
import { Badge, Card, cn } from "@/components/ui";

// সব অংশ সার্ভারে রেন্ডার হয়; ভাষার জন্য পেজ থেকে tr পাঠানো হয়

// ---------- ভিউ ----------

const VIEW_IDS = ["regular", "video", "website", "insights"] as const;

export type ViewId = (typeof VIEW_IDS)[number];

function views(tr: Tr): { id: ViewId; label: string; icon: LucideIcon }[] {
  return [
    { id: "regular", label: tr("Overview", "সাধারণ"), icon: LayoutGrid },
    { id: "video", label: tr("Video", "ভিডিও বিশ্লেষণ"), icon: Clapperboard },
    { id: "website", label: tr("Website", "ওয়েবসাইট বিশ্লেষণ"), icon: Globe },
    { id: "insights", label: tr("Breakdowns", "ইনসাইট (ব্রেকডাউন)"), icon: PieChart },
  ];
}

export function parseView(value: unknown): ViewId {
  return VIEW_IDS.includes(value as ViewId) ? (value as ViewId) : "regular";
}

// ---------- মেট্রিক ----------

type Kind = "money" | "number" | "percent" | "ratio" | "seconds" | "roas";

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

export function formatValue(v: number | null, kind: Kind, currency: string | null, tr?: Tr) {
  if (v === null) return "—";
  switch (kind) {
    case "money":
      return formatMoney(v, currency);
    case "percent":
      return formatPercent(v);
    case "ratio":
      return v.toFixed(2);
    case "seconds":
      return `${formatNumber(v, 1)}${tr ? tr("s", " সে.") : "s"}`;
    case "roas":
      return formatRoas(v);
    default:
      return formatNumber(v);
  }
}

// একই হিসাব অ্যাকাউন্টের মোট ও প্রতিটি ক্যাম্পেইন/ব্রেকডাউনে ব্যবহার হয়
const S = {
  spend: (s: LiveStats) => s.spend,
  reach: (s: LiveStats) => s.reach,
  frequency: (s: LiveStats) => s.frequency,
  ctrLink: (s: LiveStats) => pct(s.web.linkClicks, s.impressions),
  ctrAll: (s: LiveStats) => pct(s.clicks, s.impressions),
  cpm: (s: LiveStats) => ratio(s.spend * 1000, s.impressions),
  views3s: (s: LiveStats) => s.video.views3s,
  thruplays: (s: LiveStats) => s.video.thruplays,
  hookRate: (s: LiveStats) => pct(s.video.views3s, s.impressions),
  holdRate: (s: LiveStats) => pct(s.video.thruplays, s.video.views3s),
  avgWatch: (s: LiveStats) => s.video.avgWatchSec,
  costPerThruplay: (s: LiveStats) => ratio(s.spend, s.video.thruplays),
  costPer3s: (s: LiveStats) => ratio(s.spend, s.video.views3s),
  linkClicks: (s: LiveStats) => s.web.linkClicks,
  cpcLink: (s: LiveStats) => ratio(s.spend, s.web.linkClicks),
  lpv: (s: LiveStats) => s.web.landingPageViews,
  lpvRate: (s: LiveStats) => pct(s.web.landingPageViews, s.web.linkClicks),
  costPerLpv: (s: LiveStats) => ratio(s.spend, s.web.landingPageViews),
  atc: (s: LiveStats) => s.web.addToCart,
  costPerAtc: (s: LiveStats) => ratio(s.spend, s.web.addToCart),
  ic: (s: LiveStats) => s.web.initiateCheckout,
  purchases: (s: LiveStats) => s.web.purchases,
  convRate: (s: LiveStats) => pct(s.web.purchases, s.web.landingPageViews),
  roas: (s: LiveStats) => ratio(s.web.purchaseValue, s.spend),
};

type KpiDef = {
  icon: LucideIcon;
  label: string;
  kind: Kind;
  goodWhenUp: boolean | null; // null = বাড়া-কমা ভালো-খারাপ নয়
  get: (r: LiveReport) => number | null;
  hint?: (r: LiveReport, currency: string | null) => string | null;
};

function regularKpis(tr: Tr): KpiDef[] {
  return [
    {
      icon: Target,
      label: "Result",
      kind: "number",
      goodWhenUp: true,
      get: (r) => (r.primaryIndicator ? r.primaryResults : null),
      hint: (r) =>
        [
          indicatorLabel(r.primaryIndicator, tr),
          ...r.otherResults.map((o) => `+ ${formatNumber(o.results)} ${indicatorLabel(o.indicator, tr)}`),
        ].join(" "),
    },
    {
      icon: Tag,
      label: "Cost per Result",
      kind: "money",
      goodWhenUp: false,
      get: (r) => ratio(r.primarySpend, r.primaryResults),
    },
    { icon: Users, label: "Reach", kind: "number", goodWhenUp: true, get: (r) => S.reach(r.account) },
    {
      icon: Repeat,
      label: "Frequency",
      kind: "ratio",
      goodWhenUp: null,
      get: (r) => S.frequency(r.account),
      hint: (r) => {
        const f = r.account.frequency;
        return f !== null && f > 3
          ? tr("High: the same people keep seeing it", "বেশি: একই মানুষ বারবার দেখছে")
          : tr("Average views per person", "প্রতি জনে গড়ে কতবার দেখেছে");
      },
    },
    {
      icon: MousePointerClick,
      label: tr("CTR (link)", "CTR (লিংক)"),
      kind: "percent",
      goodWhenUp: true,
      get: (r) => S.ctrLink(r.account),
      hint: (r) => `${tr("CTR (all)", "CTR (সব)")} ${formatPercent(S.ctrAll(r.account))}`,
    },
    { icon: Wallet, label: tr("Amount spent", "খরচ"), kind: "money", goodWhenUp: null, get: (r) => S.spend(r.account) },
    {
      icon: Coins,
      label: tr("Daily budget", "দৈনিক বাজেট"),
      kind: "money",
      goodWhenUp: null,
      get: (r) => (r.budgetDaily > 0 ? r.budgetDaily : null),
      hint: (r, currency) =>
        r.budgetLifetime > 0
          ? tr(
              `Lifetime budgets ${formatMoney(r.budgetLifetime, currency)}`,
              `লাইফটাইম বাজেট ${formatMoney(r.budgetLifetime, currency)}`,
            )
          : tr("Total across active campaigns", "চালু ক্যাম্পেইনগুলোর মোট"),
    },
  ];
}

function videoKpis(tr: Tr): KpiDef[] {
  return [
    { icon: PlayCircle, label: tr("3-second plays", "৩ সেকেন্ড প্লে"), kind: "number", goodWhenUp: true, get: (r) => S.views3s(r.account) },
    { icon: Clapperboard, label: "ThruPlay", kind: "number", goodWhenUp: true, get: (r) => S.thruplays(r.account) },
    {
      icon: Gauge,
      label: "Hook rate",
      kind: "percent",
      goodWhenUp: true,
      get: (r) => S.hookRate(r.account),
      hint: () => tr("Share of impressions watched for 3 seconds", "Impression-এর কত % ৩ সেকেন্ড দেখেছে"),
    },
    {
      icon: Timer,
      label: "Hold rate",
      kind: "percent",
      goodWhenUp: true,
      get: (r) => S.holdRate(r.account),
      hint: () => tr("Share of 3-second viewers who reached ThruPlay", "৩ সেকেন্ড দেখাদের কত % ThruPlay করেছে"),
    },
    { icon: Eye, label: tr("Avg. watch time", "গড় দেখার সময়"), kind: "seconds", goodWhenUp: true, get: (r) => S.avgWatch(r.account) },
    { icon: Tag, label: "Cost per ThruPlay", kind: "money", goodWhenUp: false, get: (r) => S.costPerThruplay(r.account) },
  ];
}

function websiteKpis(tr: Tr): KpiDef[] {
  return [
    { icon: MousePointerClick, label: tr("Link clicks", "লিংক ক্লিক"), kind: "number", goodWhenUp: true, get: (r) => S.linkClicks(r.account) },
    { icon: Tag, label: tr("CPC (link)", "CPC (লিংক)"), kind: "money", goodWhenUp: false, get: (r) => S.cpcLink(r.account) },
    {
      icon: Globe,
      label: "Landing page view",
      kind: "number",
      goodWhenUp: true,
      get: (r) => S.lpv(r.account),
      hint: (r) =>
        tr(
          `${formatPercent(S.lpvRate(r.account))} of link clicks reached the page`,
          `লিংক ক্লিকের ${formatPercent(S.lpvRate(r.account))} পেজে পৌঁছেছে`,
        ),
    },
    { icon: Tag, label: "Cost per LPV", kind: "money", goodWhenUp: false, get: (r) => S.costPerLpv(r.account) },
    {
      icon: ShoppingCart,
      label: "Add to cart",
      kind: "number",
      goodWhenUp: true,
      get: (r) => S.atc(r.account),
      hint: (r, c) => tr(`${formatMoney(S.costPerAtc(r.account), c)} each`, `প্রতিটিতে ${formatMoney(S.costPerAtc(r.account), c)}`),
    },
    { icon: Filter, label: "Initiate checkout", kind: "number", goodWhenUp: true, get: (r) => S.ic(r.account) },
    {
      icon: ShoppingCart,
      label: "Purchase",
      kind: "number",
      goodWhenUp: true,
      get: (r) => S.purchases(r.account),
      hint: (r) => `Conversion rate ${formatPercent(S.convRate(r.account))}`,
    },
    {
      icon: TrendingUp,
      label: "ROAS",
      kind: "roas",
      goodWhenUp: true,
      get: (r) => S.roas(r.account),
      hint: (r, c) =>
        tr(
          `Purchase value ${formatMoney(r.account.web.purchaseValue, c)}`,
          `Purchase মূল্য ${formatMoney(r.account.web.purchaseValue, c)}`,
        ),
    },
  ];
}

export function kpisFor(view: ViewId, tr: Tr) {
  if (view === "video") return [...regularKpis(tr), ...videoKpis(tr)];
  if (view === "website") return [...regularKpis(tr), ...websiteKpis(tr)];
  return regularKpis(tr);
}

// ---------- KPI কার্ড ----------

function Delta({
  current,
  previous,
  goodWhenUp,
  label,
  tr,
}: {
  current: number | null;
  previous: number | null;
  goodWhenUp: boolean | null;
  label: string;
  tr: Tr;
}) {
  if (current === null || previous === null || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change)) return null;
  const flat = Math.abs(change) < 0.5;
  const up = change >= 0;
  const good = flat || goodWhenUp === null ? null : up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-0.5 text-xs",
        good === null
          ? "text-zinc-500 dark:text-zinc-400"
          : good
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400",
      )}
    >
      {!flat && <Icon className="size-3.5" aria-hidden />}
      {flat ? tr("About the same", "প্রায় একই") : `${Math.abs(change).toFixed(0)}%`}
      <span className="text-zinc-400 dark:text-zinc-500"> · {label}</span>
    </p>
  );
}

export function KpiGrid({
  defs,
  report,
  previous,
  currency,
  changeLabel,
  tr,
}: {
  defs: KpiDef[];
  report: LiveReport;
  previous: LiveReport | null;
  currency: string | null;
  changeLabel: string;
  tr: Tr;
}) {
  return (
    <section aria-label={tr("Key numbers", "মূল হিসাব")} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {defs.map((d) => {
        const Icon = d.icon;
        const value = d.get(report);
        const hint = d.hint?.(report, currency);
        return (
          <section
            key={d.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                <Icon className="size-4" aria-hidden />
              </span>
              {d.label}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatValue(value, d.kind, currency, tr)}
            </p>
            {previous && (
              <Delta
                current={value}
                previous={d.get(previous)}
                goodWhenUp={d.goodWhenUp}
                label={changeLabel}
                tr={tr}
              />
            )}
            {hint && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
          </section>
        );
      })}
    </section>
  );
}

// ---------- ধাপে ধাপে কমে যাওয়া (ভিডিও দেখা, ওয়েবসাইটে কেনাকাটা) ----------

export function FunnelCard({
  title,
  steps,
  tr,
}: {
  title: string;
  steps: { label: string; value: number }[];
  tr: Tr;
}) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const width = Math.max((s.value / top) * 100, s.value > 0 ? 2 : 0);
          const fromPrev = i > 0 ? pct(s.value, steps[i - 1].value) : null;
          return (
            <li key={s.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]">
              <span className="text-zinc-600 dark:text-zinc-400">{s.label}</span>
              <span className="h-6 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                <span
                  className="block h-full rounded-md bg-indigo-500 dark:bg-indigo-400"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="w-28 text-right tabular-nums">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatNumber(s.value)}</span>
                {fromPrev !== null && fromPrev <= 100 && (
                  <span className="ml-1 text-xs text-zinc-400">({formatPercent(fromPrev)})</span>
                )}
                {fromPrev !== null && fromPrev > 100 && (
                  <span
                    className="ml-1 text-xs text-amber-600 dark:text-amber-400"
                    title={tr(
                      "This step is higher than the one before, so the earlier event isn't being tracked properly",
                      "এই ধাপ আগের ধাপের চেয়ে বেশি, তাই আগের ধাপের ইভেন্ট ঠিকমতো ট্র্যাক হচ্ছে না",
                    )}
                  >
                    {tr("(tracking mismatch)", "(ট্র্যাকিং মিলছে না)")}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-zinc-400">
        {tr(
          "Brackets show the share kept from the previous step. If a step is higher than the one before it, that earlier event isn't reaching your Pixel properly.",
          "বন্ধনীতে আগের ধাপ থেকে কত % এগিয়েছে। কোনো ধাপ আগেরটির চেয়ে বেশি হলে সেই আগের ধাপের ইভেন্ট Pixel-এ ঠিকমতো যাচ্ছে না।",
        )}
      </p>
    </Card>
  );
}

export function videoFunnel(s: LiveStats, tr: Tr) {
  return [
    { label: tr("Video plays", "ভিডিও প্লে"), value: s.video.plays },
    { label: tr("3 seconds", "৩ সেকেন্ড"), value: s.video.views3s },
    { label: tr("Watched 25%", "২৫% দেখেছে"), value: s.video.p25 },
    { label: tr("Watched 50%", "৫০% দেখেছে"), value: s.video.p50 },
    { label: tr("Watched 75%", "৭৫% দেখেছে"), value: s.video.p75 },
    { label: tr("Watched 95%", "৯৫% দেখেছে"), value: s.video.p95 },
    { label: tr("Watched to the end", "পুরোটা দেখেছে"), value: s.video.p100 },
  ];
}

export function websiteFunnel(s: LiveStats, tr: Tr) {
  return [
    { label: tr("Link clicks", "লিংক ক্লিক"), value: s.web.linkClicks },
    { label: "Landing page view", value: s.web.landingPageViews },
    { label: "Add to cart", value: s.web.addToCart },
    { label: "Initiate checkout", value: s.web.initiateCheckout },
    { label: "Purchase", value: s.web.purchases },
  ];
}

// ---------- টেবিল ----------

type Column<T> = {
  label: string;
  kind: Kind;
  get: (row: T) => number | null;
  badge?: (v: number | null) => "success" | "warning" | "danger" | "neutral";
};

const roasTone = (v: number | null) =>
  v === null ? "neutral" : v >= 2 ? "success" : v >= 1 ? "warning" : "danger";

function statColumns(view: ViewId, tr: Tr): Column<LiveStats>[] {
  const spend: Column<LiveStats> = { label: tr("Spent", "খরচ"), kind: "money", get: S.spend };
  const ctr: Column<LiveStats> = { label: tr("CTR (link)", "CTR (লিংক)"), kind: "percent", get: S.ctrLink };
  switch (view) {
    case "video":
      return [
        { label: tr("3s plays", "৩ সে. প্লে"), kind: "number", get: S.views3s },
        { label: "ThruPlay", kind: "number", get: S.thruplays },
        { label: "Hook rate", kind: "percent", get: S.hookRate },
        { label: "Hold rate", kind: "percent", get: S.holdRate },
        { label: tr("Avg. watch", "গড় দেখা"), kind: "seconds", get: S.avgWatch },
        { label: "Cost/ThruPlay", kind: "money", get: S.costPerThruplay },
        spend,
      ];
    case "website":
      return [
        { label: tr("Link clicks", "লিংক ক্লিক"), kind: "number", get: S.linkClicks },
        { label: "CPC", kind: "money", get: S.cpcLink },
        { label: "LPV", kind: "number", get: S.lpv },
        { label: "Add to cart", kind: "number", get: S.atc },
        { label: "Checkout", kind: "number", get: S.ic },
        { label: "Purchase", kind: "number", get: S.purchases },
        { label: "ROAS", kind: "roas", get: S.roas, badge: roasTone },
        spend,
      ];
    default:
      return [
        { label: "Reach", kind: "number", get: S.reach },
        { label: "Frequency", kind: "ratio", get: S.frequency },
        ctr,
        { label: "CPM", kind: "money", get: S.cpm },
        spend,
      ];
  }
}

function Cell({
  col,
  value,
  currency,
  tr,
}: {
  col: Column<LiveStats>;
  value: number | null;
  currency: string | null;
  tr: Tr;
}) {
  const text = formatValue(value, col.kind, currency, tr);
  return (
    <td className="px-3 py-3 text-right">
      {col.badge ? <Badge tone={col.badge(value)}>{text}</Badge> : text}
    </td>
  );
}

const TH = "px-3 py-3 text-right whitespace-nowrap";

// অ্যাকাউন্টের গড়ের তুলনায়: ২০% কম খরচ ভালো (সবুজ), ২৫% বেশি খারাপ (লাল)
function cprTone(cpr: number | null, avg: number | null) {
  if (cpr === null || avg === null || avg <= 0) return "neutral" as const;
  if (cpr <= avg * 0.8) return "success" as const;
  if (cpr >= avg * 1.25) return "danger" as const;
  return "warning" as const;
}

export function CampaignTable({
  view,
  campaigns,
  currency,
  primaryIndicator,
  averageCpr,
  analysisHref,
  tr,
}: {
  view: ViewId;
  campaigns: LiveCampaign[];
  currency: string | null;
  primaryIndicator: string | null;
  averageCpr: number | null;
  analysisHref: (campaignId: string) => string;
  tr: Tr;
}) {
  const cols = statColumns(view, tr);
  const showResults = view === "regular" || view === "insights";

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{tr("Campaigns", "ক্যাম্পেইন")}</h2>
        <Badge>{tr(`${campaigns.length}`, `${campaigns.length}টি`)}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-5 py-3">{tr("Campaign", "ক্যাম্পেইন")}</th>
              {showResults && (
                <>
                  <th scope="col" className={TH}>Result</th>
                  <th scope="col" className={TH}>Cost/Result</th>
                </>
              )}
              {cols.map((c) => (
                <th key={c.label} scope="col" className={TH}>{c.label}</th>
              ))}
              {showResults && <th scope="col" className={TH}>{tr("Daily budget", "দৈনিক বাজেট")}</th>}
              <th scope="col" className={cn(TH, "pr-5")}>
                <span className="sr-only">{tr("Analysis", "বিশ্লেষণ")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={cols.length + 5} className="px-5 py-10 text-center text-zinc-500">
                  {tr("No campaign spent anything in this period.", "এই সময়ে কোনো ক্যাম্পেইনে খরচ হয়নি।")}
                </td>
              </tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="max-w-xs truncate px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100" title={c.name}>
                  {c.name}
                </td>
                {showResults && (
                  <>
                    <td className="px-3 py-3 text-right">
                      <span className="block">{formatNumber(c.results)}</span>
                      <span className="block text-xs text-zinc-400">{indicatorLabel(c.resultIndicator, tr)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {/* একই ধরনের Result হলে অ্যাকাউন্টের গড়ের সাথে তুলনা করে রঙ */}
                      <Badge
                        tone={
                          c.resultIndicator === primaryIndicator
                            ? cprTone(ratio(c.spend, c.results), averageCpr)
                            : "neutral"
                        }
                      >
                        {formatValue(ratio(c.spend, c.results), "money", currency)}
                      </Badge>
                    </td>
                  </>
                )}
                {cols.map((col) => (
                  <Cell key={col.label} col={col} value={col.get(c)} currency={currency} tr={tr} />
                ))}
                {showResults && (
                  <td className="px-3 py-3 text-right">
                    {c.budget && c.budget.daily > 0
                      ? formatMoney(c.budget.daily, currency)
                      : c.budget && c.budget.lifetime > 0
                        ? `${formatMoney(c.budget.lifetime, currency)} ${tr("(lifetime)", "(লাইফটাইম)")}`
                        : "—"}
                  </td>
                )}
                <td className="px-3 py-2 pr-5 text-right">
                  <Link
                    href={analysisHref(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {tr("Analyze", "বিশ্লেষণ")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function BreakdownSection({
  breakdown,
  rows,
  resultLabel,
  currency,
  hrefFor,
  tr,
}: {
  breakdown: BreakdownId;
  rows: BreakdownRow[];
  resultLabel: string;
  currency: string | null;
  hrefFor: (bd: BreakdownId) => string;
  tr: Tr;
}) {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const resultsMissing = rows.length > 0 && rows.every((r) => r.results === null);
  const name = (id: BreakdownId) => tr(BREAKDOWNS[id].en, BREAKDOWNS[id].bn);
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{tr("Breakdown", "ব্রেকডাউন")}</h2>
        <nav aria-label={tr("Breakdown", "ব্রেকডাউন")} className="flex flex-wrap gap-1">
          {(Object.keys(BREAKDOWNS) as BreakdownId[]).map((id) => (
            <Link
              key={id}
              href={hrefFor(id)}
              aria-current={id === breakdown ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm",
                id === breakdown
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
              )}
            >
              {name(id)}
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-5 py-3">{name(breakdown)}</th>
              <th scope="col" className={TH}>{tr("Spent", "খরচ")}</th>
              <th scope="col" className={TH}>{tr("Share of spend", "খরচের ভাগ")}</th>
              <th scope="col" className={TH}>{resultLabel}</th>
              <th scope="col" className={TH}>Cost/Result</th>
              <th scope="col" className={TH}>Reach</th>
              <th scope="col" className={TH}>{tr("CTR (link)", "CTR (লিংক)")}</th>
              <th scope="col" className={cn(TH, "pr-5")}>CPM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-zinc-500">
                  {tr("No data for this period.", "এই সময়ে কোনো ডাটা নেই।")}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const share = pct(r.spend, totalSpend);
              return (
                <tr key={r.key} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{r.label}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(r.spend, currency)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <span
                          className="block h-full bg-indigo-500 dark:bg-indigo-400"
                          style={{ width: `${share ?? 0}%` }}
                        />
                      </span>
                      {formatPercent(share)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.results)}</td>
                  <td className="px-3 py-3 text-right">
                    {formatValue(r.results === null ? null : ratio(r.spend, r.results), "money", currency)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.reach)}</td>
                  <td className="px-3 py-3 text-right">{formatPercent(S.ctrLink(r))}</td>
                  <td className="px-3 py-3 pr-5 text-right">{formatValue(S.cpm(r), "money", currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {resultsMissing && (
        <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {tr(
            `For privacy reasons Meta doesn't report ${resultLabel} in this breakdown. Spend, reach and CTR are still shown; for results, look at age, gender, placement or device.`,
            `Meta গোপনীয়তার কারণে এই ব্রেকডাউনে ${resultLabel} দেখায় না। খরচ, Reach ও CTR দেখা যাবে; ফলাফলের জন্য বয়স, লিঙ্গ, প্লেসমেন্ট বা ডিভাইস দেখো।`,
          )}
        </p>
      )}
      <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-400 dark:border-zinc-800">
        {tr(
          `${resultLabel} is counted from the account's main result type. Meta hides some small numbers in breakdowns, so totals can be slightly lower.`,
          `${resultLabel} গোনা হয়েছে অ্যাকাউন্টের মূল Result ধরন থেকে। Meta ব্রেকডাউনে কিছু ছোট সংখ্যা গোপন রাখে, তাই যোগফল সামান্য কম হতে পারে।`,
        )}
      </p>
    </Card>
  );
}

export function ViewTabs({ view, hrefFor, tr }: { view: ViewId; hrefFor: (v: ViewId) => string; tr: Tr }) {
  return (
    <nav
      aria-label={tr("Analysis type", "বিশ্লেষণের ধরন")}
      className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {views(tr).map(({ id, label, icon: Icon }) => (
        <Link
          key={id}
          href={hrefFor(id)}
          aria-current={id === view ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            id === view
              ? "bg-indigo-600 text-white dark:bg-indigo-500"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
