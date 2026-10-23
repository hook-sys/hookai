import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { getUserPlan } from "@/lib/plans";
import { getReport, isReportKind } from "@/lib/reports";
import { formatRange } from "@/lib/dates";
import AppShell from "@/components/AppShell";
import { Badge, Card, LogoMark, buttonClass } from "@/components/ui";
import { CampaignReportContent, SummaryContent } from "@/components/reports/ReportContent";
import { deleteReport } from "../../actions";
import ExportButtons from "./ExportButtons";

type Props = { params: Promise<{ kind: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { kind } = await params;
  return { title: kind === "campaign" ? "Campaign report" : "AI summary" };
}

export default async function ReportPage({ params }: Props) {
  const { kind, id } = await params;
  if (!isReportKind(kind)) notFound();

  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [report, plan] = await Promise.all([getReport(supabase, user.id, kind, id), getUserPlan(supabase, user.id)]);
  if (!report) notFound();

  const typeLabel = kind === "summary" ? tr("AI summary", "AI সারসংক্ষেপ") : tr("Campaign report", "ক্যাম্পেইন রিপোর্ট");
  const period = report.date_from && report.date_to ? formatRange(report.date_from, report.date_to) : "—";

  return (
    <AppShell active="reports">
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 print:hidden dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tr("All reports", "সব রিপোর্ট")}
      </Link>

      <div className="print-doc">
        {/* প্রিন্ট বা PDF-এ উপরে Hook-এর নাম ও লোগো */}
        <div className="mb-6 hidden items-center gap-3 border-b border-zinc-200 pb-4 print:flex">
          <LogoMark className="size-8" />
          <div>
            <p className="text-sm font-bold">HOOK AI</p>
            <p className="text-xs">{typeLabel}</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Badge tone="brand">{typeLabel}</Badge>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{report.title}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {tr("Period", "সময়")}: {period} · {tr("Created", "তৈরি")} {new Date(report.created_at).toLocaleString("en-GB")} ·{" "}
              {report.model}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ExportButtons csvHref={`/reports/${kind}/${id}/csv`} allowed={plan.exportReports} />
          </div>
        </div>

        <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
          {report.kind === "summary" ? (
            <SummaryContent content={report.content} />
          ) : (
            <CampaignReportContent content={report.content} />
          )}
        </Card>

        <p className="mt-4 text-xs text-zinc-400">
          {tr(
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
