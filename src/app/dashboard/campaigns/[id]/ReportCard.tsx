"use client";

import { useActionState } from "react";
import {
  AlertTriangle,
  Clapperboard,
  Globe,
  Lightbulb,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge, Card, buttonClass } from "@/components/ui";
import type { Priority, StoredCampaignReport } from "@/lib/ai/campaignReport";
import { formatRange } from "@/lib/dates";
import { generateCampaignReportAction, type ReportState } from "./actions";

const PRIORITY: Record<Priority, { label: string; tone: "danger" | "warning" | "neutral" }> = {
  high: { label: "জরুরি", tone: "danger" },
  medium: { label: "গুরুত্বপূর্ণ", tone: "warning" },
  low: { label: "পরে করলেও চলে", tone: "neutral" },
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Icon className="size-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

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
              AI ক্যাম্পেইন রিপোর্ট
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              কে কিনছে, কখন, কোথায় মানুষ হারিয়ে যাচ্ছে, আর কী করবে · প্রতিটি ক্যাম্পেইনে দিনে একবার
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
              ? "বিশ্লেষণ চলছে..."
              : usedToday
                ? "আজকের রিপোর্ট নেওয়া হয়েছে"
                : "রিপোর্ট তৈরি করো"}
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
            AI ক্যাম্পেইনের বয়স, লিঙ্গ, এলাকা, সময়, ভিডিও আর ওয়েবসাইটের ডাটা বিশ্লেষণ করছে। ৩০-৯০ সেকেন্ড লাগতে পারে...
          </p>
        )}

        {!pending && !c && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            এখনো কোনো রিপোর্ট নেই। বোতাম চাপলে AI নিচের সব ডাটা দেখে বলবে কোন অডিয়েন্স ও সময়ে ভালো
            বিক্রি হচ্ছে, ভিডিও ও ওয়েবসাইটে কোথায় মানুষ চলে যাচ্ছে, আর সমাধান কী।
          </p>
        )}

        {!pending && c && report && (
          <div className="flex flex-col gap-6">
            {!usedToday && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                এটি আগের রিপোর্ট ({formatRange(report.date_from, report.date_to)}-এর ডাটা)। আজ নতুন রিপোর্ট নিতে পারো।
              </p>
            )}

            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{c.headline}</p>
              {c.overview && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{c.overview}</p>
              )}
            </div>

            {c.best_audience.length > 0 && (
              <Section icon={Users} title="কোথায় ভালো চলছে">
                <ul className="grid gap-2 md:grid-cols-2">
                  {c.best_audience.map((b, i) => (
                    <li key={i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                      {b.dimension && <Badge tone="brand">{b.dimension}</Badge>}
                      <p className="mt-1.5 text-zinc-700 dark:text-zinc-300">{b.finding}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {(c.video_analysis || c.website_analysis) && (
              <div className="grid gap-6 md:grid-cols-2">
                {c.video_analysis && (
                  <Section icon={Clapperboard} title="ভিডিওতে কোথায় মানুষ চলে যাচ্ছে">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.video_analysis}</p>
                  </Section>
                )}
                {c.website_analysis && (
                  <Section icon={Globe} title="ওয়েবসাইটে কোন ধাপে মানুষ চলে যাচ্ছে">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.website_analysis}</p>
                  </Section>
                )}
              </div>
            )}

            {c.problems.length > 0 && (
              <Section icon={AlertTriangle} title="সমস্যা">
                <ul className="flex flex-col gap-2">
                  {c.problems.map((p, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.title}</span>
                      {p.evidence && <span className="text-zinc-600 dark:text-zinc-400"> · {p.evidence}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {c.solutions.length > 0 && (
              <Section icon={Lightbulb} title="সমাধান: এখন কী করবে">
                <ol className="flex flex-col gap-3">
                  {c.solutions.map((s, i) => (
                    <li key={i} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.action}</span>
                        <Badge tone={PRIORITY[s.priority].tone}>{PRIORITY[s.priority].label}</Badge>
                      </div>
                      {s.reason && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.reason}</p>}
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              তৈরি:{" "}
              <span suppressHydrationWarning>{new Date(report.created_at).toLocaleString("en-GB")}</span> ·{" "}
              {report.model} · AI ভুল করতে পারে, বড় সিদ্ধান্তের আগে সংখ্যাগুলো মিলিয়ে নিও।
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
