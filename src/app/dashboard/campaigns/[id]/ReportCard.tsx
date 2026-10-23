"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import type { StoredCampaignReport } from "@/lib/ai/campaignReport";
import { CampaignReportContent } from "@/components/reports/ReportContent";
import { formatRange } from "@/lib/dates";
import { useTr } from "@/components/I18nProvider";
import { generateCampaignReportAction, type ReportState } from "./actions";

export default function ReportCard({
  campaignId,
  since,
  until,
  todays,
  latest,
}: {
  campaignId: string;
  since: string;
  until: string;
  todays: StoredCampaignReport | null;
  latest: StoredCampaignReport | null;
}) {
  const tr = useTr();
  const [state, formAction, pending] = useActionState<ReportState, FormData>(
    generateCampaignReportAction,
    null,
  );

  const report = state?.ok ? state.report : (todays ?? latest);
  const usedToday = Boolean(todays) || state?.ok === true;
  const c = report?.content;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4 dark:border-zinc-800 dark:from-indigo-950/60 dark:to-violet-950/60">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {tr("AI campaign report", "AI ক্যাম্পেইন রিপোর্ট")}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {tr(
                "Who buys, when, where people drop off, and what to do · once a day per campaign",
                "কে কিনছে, কখন, কোথায় মানুষ হারিয়ে যাচ্ছে, আর কী করবে · প্রতিটি ক্যাম্পেইনে দিনে একবার",
              )}
            </p>
          </div>
        </div>
        <form action={formAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="since" value={since} />
          <input type="hidden" name="until" value={until} />
          <button
            type="submit"
            disabled={pending || usedToday}
            className={buttonClass(report ? "secondary" : "primary")}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {pending
              ? tr("Analyzing…", "বিশ্লেষণ চলছে...")
              : usedToday
                ? tr("Today's report is done", "আজকের রিপোর্ট নেওয়া হয়েছে")
                : tr("Create report", "রিপোর্ট তৈরি করো")}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="px-5 py-5">
        {state && !state.ok && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {state.error}
          </p>
        )}

        {pending && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tr(
              "The AI is reading this campaign's age, gender, region, timing, video and website data. This can take 30–90 seconds…",
              "AI ক্যাম্পেইনের বয়স, লিঙ্গ, এলাকা, সময়, ভিডিও আর ওয়েবসাইটের ডাটা বিশ্লেষণ করছে। ৩০-৯০ সেকেন্ড লাগতে পারে...",
            )}
          </p>
        )}

        {!pending && !c && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tr(
              "No report yet. Press the button and the AI will look at everything below and tell you which audiences and hours sell best, where people leave your video and website, and how to fix it.",
              "এখনো কোনো রিপোর্ট নেই। বোতাম চাপলে AI নিচের সব ডাটা দেখে বলবে কোন অডিয়েন্স ও সময়ে ভালো বিক্রি হচ্ছে, ভিডিও ও ওয়েবসাইটে কোথায় মানুষ চলে যাচ্ছে, আর সমাধান কী।",
            )}
          </p>
        )}

        {!pending && c && report && (
          <div className="flex flex-col gap-6">
            {!usedToday && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tr(
                  `This is an earlier report (data for ${formatRange(report.date_from, report.date_to)}). You can take a new one today.`,
                  `এটি আগের রিপোর্ট (${formatRange(report.date_from, report.date_to)}-এর ডাটা)। আজ নতুন রিপোর্ট নিতে পারো।`,
                )}
              </p>
            )}

            <CampaignReportContent content={c} />

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {tr("Created", "তৈরি")}:{" "}
              <span suppressHydrationWarning>{new Date(report.created_at).toLocaleString("en-GB")}</span> ·{" "}
              {report.model} ·{" "}
              {tr("AI can make mistakes. Check the numbers before big decisions.", "AI ভুল করতে পারে, বড় সিদ্ধান্তের আগে সংখ্যাগুলো মিলিয়ে নিও।")}{" "}
              ·{" "}
              <Link href={`/reports/campaign/${report.id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                {tr("Open, save or export", "খোলো, সংরক্ষণ বা এক্সপোর্ট করো")}
              </Link>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
