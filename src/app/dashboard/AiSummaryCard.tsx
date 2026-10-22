"use client";

import { useActionState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Badge, Card, buttonClass } from "@/components/ui";
import type { Priority, StoredSummary } from "@/lib/ai/summary";
import { generateAiSummary, type SummaryState } from "./actions";

const PRIORITY: Record<Priority, { label: string; tone: "danger" | "warning" | "neutral" }> = {
  high: { label: "জরুরি", tone: "danger" },
  medium: { label: "গুরুত্বপূর্ণ", tone: "warning" },
  low: { label: "পরে করলেও চলে", tone: "neutral" },
};

function List({
  title,
  items,
  icon: Icon,
  iconClass,
}: {
  title: string;
  items: string[];
  icon: typeof CheckCircle2;
  iconClass: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <Icon className={`mt-0.5 size-4 shrink-0 ${iconClass}`} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AiSummaryCard({
  initial,
  since,
  until,
  periodLabel,
  compare,
}: {
  initial: StoredSummary | null;
  since: string;
  until: string;
  periodLabel: string;
  compare: boolean;
}) {
  const [state, formAction, pending] = useActionState<SummaryState, FormData>(
    generateAiSummary,
    null,
  );

  // সদ্য তৈরি হলে সেটি, নাহলে আগে জমা থাকা সর্বশেষটি
  const summary = state?.ok ? state.summary : initial;
  const content = summary?.content;

  const button = (
    <form action={formAction}>
      <input type="hidden" name="since" value={since} />
      <input type="hidden" name="until" value={until} />
      <input type="hidden" name="compare" value={compare ? "1" : "0"} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass(summary ? "secondary" : "primary")}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {pending ? "বিশ্লেষণ চলছে..." : summary ? "নতুন করে বিশ্লেষণ" : "AI সারসংক্ষেপ তৈরি করো"}
      </button>
    </form>
  );

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4 dark:border-zinc-800 dark:from-indigo-950/60 dark:to-violet-950/60">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              AI সারসংক্ষেপ
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {periodLabel}-এর হিসাব দেখে AI-এর বিশ্লেষণ ও পরামর্শ
            </p>
          </div>
        </div>
        {button}
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
            AI তোমার ক্যাম্পেইনগুলো বিশ্লেষণ করছে। সাধারণত ২০-৬০ সেকেন্ড লাগে...
          </p>
        )}

        {!pending && !content && !(state && !state.ok) && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            এখনো কোনো সারসংক্ষেপ তৈরি হয়নি। উপরের বোতাম চাপলে AI তোমার বিজ্ঞাপনের হিসাব দেখে
            সহজ বাংলায় বলবে কী ভালো চলছে, কোথায় সমস্যা, আর এখন কী করা উচিত।
          </p>
        )}

        {!pending && content && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {content.headline}
              </p>
              {content.overview && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {content.overview}
                </p>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <List
                title="ভালো চলছে"
                items={content.highlights}
                icon={CheckCircle2}
                iconClass="text-emerald-600 dark:text-emerald-400"
              />
              <List
                title="নজর দেওয়া দরকার"
                items={content.concerns}
                icon={AlertTriangle}
                iconClass="text-amber-600 dark:text-amber-400"
              />
            </div>

            {content.recommendations.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  এখন কী করবে
                </h3>
                <ol className="flex flex-col gap-3">
                  {content.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <Lightbulb
                        className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {r.action}
                          </span>
                          <Badge tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Badge>
                        </div>
                        {r.campaign && (
                          <p className="mt-0.5 text-xs text-zinc-500">ক্যাম্পেইন: {r.campaign}</p>
                        )}
                        {r.reason && (
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.reason}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              তৈরি:{" "}
              <span suppressHydrationWarning>
                {new Date(summary!.created_at).toLocaleString("en-GB")}
              </span>{" "}
              · {summary!.model} · AI ভুল করতে পারে, বড় সিদ্ধান্তের আগে সংখ্যাগুলো মিলিয়ে নিও।
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
