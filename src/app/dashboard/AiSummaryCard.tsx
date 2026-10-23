"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import type { StoredSummary } from "@/lib/ai/summary";
import { SummaryContent } from "@/components/reports/ReportContent";
import { useTr } from "@/components/I18nProvider";
import { generateAiSummary, type SummaryState } from "./actions";

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
  const tr = useTr();
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
        {pending
          ? tr("Analyzing…", "বিশ্লেষণ চলছে...")
          : summary
            ? tr("Analyze again", "নতুন করে বিশ্লেষণ")
            : tr("Create AI summary", "AI সারসংক্ষেপ তৈরি করো")}
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
              {tr("AI summary", "AI সারসংক্ষেপ")}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {tr(`Analysis and advice · ${periodLabel}`,`${periodLabel}-এর হিসাব দেখে AI-এর বিশ্লেষণ ও পরামর্শ`)}
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
            {tr(
              "The AI is reading your campaigns. This usually takes 20–60 seconds…",
              "AI তোমার ক্যাম্পেইনগুলো বিশ্লেষণ করছে। সাধারণত ২০-৬০ সেকেন্ড লাগে...",
            )}
          </p>
        )}

        {!pending && !content && !(state && !state.ok) && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tr(
              "No summary yet. Press the button and the AI will read your numbers and tell you, in plain words, what's working, what isn't, and what to do now.",
              "এখনো কোনো সারসংক্ষেপ তৈরি হয়নি। উপরের বোতাম চাপলে AI তোমার বিজ্ঞাপনের হিসাব দেখে সহজ বাংলায় বলবে কী ভালো চলছে, কোথায় সমস্যা, আর এখন কী করা উচিত।",
            )}
          </p>
        )}

        {!pending && content && (
          <div className="flex flex-col gap-6">
            <SummaryContent content={content} />
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {tr("Created", "তৈরি")}:{" "}
              <span suppressHydrationWarning>{new Date(summary!.created_at).toLocaleString("en-GB")}</span> ·{" "}
              {tr("AI can make mistakes. Check the numbers before big decisions.", "AI ভুল করতে পারে, বড় সিদ্ধান্তের আগে সংখ্যাগুলো মিলিয়ে নিও।")}{" "}
              ·{" "}
              <Link href={`/reports/summary/${summary!.id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                {tr("Open, save or export", "খোলো, সংরক্ষণ বা এক্সপোর্ট করো")}
              </Link>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
