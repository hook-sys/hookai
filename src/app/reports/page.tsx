import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileText, Megaphone, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { isReportKind, listReports } from "@/lib/reports";
import { formatRange } from "@/lib/dates";
import AppShell from "@/components/AppShell";
import { Badge, Card, EmptyState, Notice, PageHeader, buttonClass, cn } from "@/components/ui";

export const metadata = { title: "Reports" };

type Props = { searchParams: Promise<{ type?: string; deleted?: string }> };

// তৈরি হওয়া সব AI রিপোর্ট এক জায়গায়; খুলে PDF বা CSV হিসেবে নামানো যায়
export default async function ReportsPage({ searchParams }: Props) {
  const tr = await getTr();
  const { type, deleted } = await searchParams;
  const kind = isReportKind(type) ? type : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reports = await listReports(supabase, user.id, kind);
  const tabs = [
    { id: null, label: tr("All", "সব"), href: "/reports" },
    { id: "summary", label: tr("AI summaries", "AI সারসংক্ষেপ"), href: "/reports?type=summary" },
    { id: "campaign", label: tr("Campaign reports", "ক্যাম্পেইন রিপোর্ট"), href: "/reports?type=campaign" },
  ];

  return (
    <AppShell active="reports">
      <PageHeader
        title={tr("Reports", "রিপোর্ট")}
        description={tr(
          "Every AI summary and campaign report you've created is saved here. Open one to download it as PDF or CSV.",
          "তোমার তৈরি সব AI সারসংক্ষেপ আর ক্যাম্পেইন রিপোর্ট এখানে জমা থাকে। খুলে PDF বা CSV হিসেবে নামাতে পারো।",
        )}
      />
      {deleted && <Notice tone="info">{tr("Report deleted.", "রিপোর্ট মুছে ফেলা হয়েছে।")}</Notice>}

      <nav aria-label={tr("Report type", "রিপোর্টের ধরন")} className="mb-4 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.id === kind ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              t.id === kind
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tr("No reports yet", "এখনো কোনো রিপোর্ট নেই")}
          text={tr(
            "Create an AI summary on the dashboard or a report on any campaign's analysis page. It will show up here.",
            "ড্যাশবোর্ডে AI সারসংক্ষেপ বা কোনো ক্যাম্পেইনের বিশ্লেষণ পেজে রিপোর্ট তৈরি করো। সেটা এখানে চলে আসবে।",
          )}
          action={
            <Link href="/dashboard" className={buttonClass("primary")}>
              {tr("Go to dashboard", "ড্যাশবোর্ডে যাও")}
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {reports.map((r) => {
              const Icon = r.kind === "summary" ? Sparkles : Megaphone;
              return (
                <li key={`${r.kind}-${r.id}`}>
                  <Link
                    href={`/reports/${r.kind}/${r.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {r.kind === "campaign" ? r.campaignName : r.accountName}
                        </span>
                        <Badge tone={r.kind === "summary" ? "brand" : "neutral"}>
                          {r.kind === "summary" ? tr("AI summary", "AI সারসংক্ষেপ") : tr("Campaign report", "ক্যাম্পেইন রিপোর্ট")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">{r.headline}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Ad Account: {r.accountName}</span>
                        <span>
                          {tr("Campaigns", "ক্যাম্পেইন")}: {r.campaignName ?? tr("All campaigns", "সব ক্যাম্পেইন")}
                        </span>
                        <span>
                          {tr("Data", "ডাটা")}: {r.date_from && r.date_to ? formatRange(r.date_from, r.date_to) : "—"}
                        </span>
                        <span>
                          {tr("Created", "তৈরি")}:{" "}
                          {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" })}
                        </span>
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
