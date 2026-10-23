import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getTr } from "@/lib/i18n-server";
import { makeTr, normalizeLocale, type Locale } from "@/lib/i18n";
import { I18nProvider } from "@/components/I18nProvider";
import { getUserPlan } from "@/lib/plans";
import { campaignsLabel, getReport, getTranslation, isReportKind } from "@/lib/reports";
import { formatRange } from "@/lib/dates";
import AppShell from "@/components/AppShell";
import { Badge, Card, LogoMark, Notice, buttonClass } from "@/components/ui";
import { CampaignReportContent, SummaryContent } from "@/components/reports/ReportContent";
import { deleteReport } from "../../actions";
import ExportButtons from "./ExportButtons";
import ReportLanguage from "./ReportLanguage";

// প্রথমবার অনুবাদে AI-এর কিছুটা সময় লাগে
export const maxDuration = 60;

type Props = {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ lang?: string; error?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { kind } = await params;
  return { title: kind === "campaign" ? "Campaign report" : "AI summary" };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { kind, id } = await params;
  if (!isReportKind(kind)) notFound();
  const { lang, error } = await searchParams;

  const tr = await getTr();
  // না বললে অ্যাপের ভাষাতেই রিপোর্ট দেখানোর চেষ্টা (অনুবাদ থাকলে)
  const want: Locale = lang ? normalizeLocale(lang) : await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [report, plan] = await Promise.all([getReport(supabase, user.id, kind, id, want), getUserPlan(supabase, user.id)]);
  if (!report) notFound();

  const other: Locale = report.originalLocale === "en" ? "bn" : "en";
  const available: Locale[] = [report.originalLocale];
  if (report.shownLocale === other || (await getTranslation(supabase, kind, id, other))) available.push(other);

  // রিপোর্টের অংশগুলো (শিরোনাম, তথ্য, লেখা) রিপোর্টের ভাষায়, যাতে PDF ও CSV এক ভাষায় হয়
  const rtr = makeTr(report.shownLocale);
  const typeLabel = kind === "summary" ? rtr("AI summary", "AI সারসংক্ষেপ") : rtr("Campaign report", "ক্যাম্পেইন রিপোর্ট");
  const period = report.date_from && report.date_to ? formatRange(report.date_from, report.date_to) : "—";
  const created = new Date(report.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  const facts = [
    { k: "Ad Account", v: report.accountName },
    { k: rtr("Campaigns", "ক্যাম্পেইন"), v: campaignsLabel(report, rtr) },
    { k: rtr("Data period", "ডাটার সময়"), v: period },
    { k: rtr("Created", "তৈরি"), v: created },
  ];

  return (
    <AppShell active="reports">
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 print:hidden dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tr("All reports", "সব রিপোর্ট")}
      </Link>

      {error === "translate" && (
        <Notice tone="danger">
          {tr("Couldn't translate the report. Please try again shortly.", "রিপোর্ট অনুবাদ করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।")}
        </Notice>
      )}

      <div className="print-doc">
        {/* প্রিন্ট বা PDF-এ উপরে Hook-এর নাম ও লোগো */}
        <div className="mb-6 hidden items-center gap-3 border-b border-zinc-200 pb-4 print:flex">
          <LogoMark className="size-8" />
          <div>
            <p className="text-sm font-bold">HOOK AI</p>
            <p className="text-xs">{typeLabel}</p>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Badge tone="brand">{typeLabel}</Badge>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {report.kind === "campaign" ? report.campaignName : report.accountName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ExportButtons csvHref={`/reports/${kind}/${id}/csv?lang=${report.shownLocale}`} allowed={plan.exportReports} />
          </div>
        </div>

        <dl className="mb-5 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
          {facts.map((f) => (
            <div key={f.k} className="min-w-0">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{f.k}</dt>
              <dd className="mt-0.5 font-medium break-words text-zinc-900 dark:text-zinc-100">{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mb-4 print:hidden">
          <ReportLanguage kind={kind} id={id} shown={report.shownLocale} available={available} />
        </div>

        <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
          <I18nProvider locale={report.shownLocale}>
            {report.kind === "summary" ? (
              <SummaryContent content={report.content} />
            ) : (
              <CampaignReportContent content={report.content} />
            )}
          </I18nProvider>
        </Card>

        <p className="mt-4 text-xs text-zinc-400">
          {rtr(
            "Written by AI from your Meta ad data. AI can make mistakes; check the numbers before big decisions.",
            "তোমার Meta বিজ্ঞাপনের ডাটা থেকে AI লিখেছে। AI ভুল করতে পারে; বড় সিদ্ধান্তের আগে সংখ্যাগুলো মিলিয়ে নিও।",
          )}
        </p>
      </div>

      <form action={deleteReport} className="mt-10 border-t border-zinc-200 pt-6 print:hidden dark:border-zinc-800">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={buttonClass("danger", "-ml-4")}>
          <Trash2 className="size-4" aria-hidden />
          {tr("Delete this report", "এই রিপোর্ট মুছে ফেলো")}
        </button>
        <p className="mt-1 text-xs text-zinc-400">
          {tr("Deleting doesn't give back AI allowance.", "মুছলেও AI ব্যবহারের সীমা ফেরত আসে না।")}
        </p>
      </form>
    </AppShell>
  );
}
