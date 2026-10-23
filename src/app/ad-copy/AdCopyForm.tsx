"use client";

import { useActionState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { useLocale, useTr } from "@/components/I18nProvider";
import { Card, buttonClass, cn, inputClass } from "@/components/ui";
import type { StoredAdCopy } from "@/lib/ai/adCopyShared";
import { createAdCopy, type AdCopyState } from "./actions";
import CopyResult from "./CopyResult";

function Choice({
  name,
  legend,
  options,
  defaultValue,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="mb-1.5 font-medium text-zinc-700 dark:text-zinc-300">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-700 dark:border-zinc-700 dark:text-zinc-300 dark:has-[:checked]:border-indigo-400 dark:has-[:checked]:bg-indigo-950 dark:has-[:checked]:text-indigo-200"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AdCopyForm({ latest, quotaText }: { latest: StoredAdCopy | null; quotaText: string }) {
  const tr = useTr();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<AdCopyState, FormData>(createAdCopy, null);
  const result = state?.ok ? state.copy : latest;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className="h-fit p-5">
        <form action={formAction} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("What are you selling?", "কী বিক্রি করছ?")}</span>
            <textarea
              name="product"
              required
              minLength={10}
              maxLength={1500}
              rows={5}
              placeholder={tr(
                "e.g. Men's winter jacket, waterproof, sizes M–XXL, ৳1,850, free delivery in Dhaka, cash on delivery",
                "যেমন: ছেলেদের শীতের জ্যাকেট, ওয়াটারপ্রুফ, সাইজ M–XXL, দাম ৳১,৮৫০, ঢাকায় ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারি",
              )}
              className={inputClass}
            />
            <span className="text-xs text-zinc-400">
              {tr("Include the price and offer. The AI won't invent any.", "দাম আর অফার লিখে দাও। AI নিজে থেকে কোনো দাম বা অফার বানাবে না।")}
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {tr("Who is it for?", "কাদের জন্য?")} <span className="font-normal text-zinc-400">{tr("(optional)", "(ঐচ্ছিক)")}</span>
            </span>
            <input
              name="audience"
              maxLength={300}
              placeholder={tr("e.g. Office-going men 22–35 in Dhaka", "যেমন: ঢাকার ২২–৩৫ বছরের চাকরিজীবী ছেলেরা")}
              className={inputClass}
            />
          </label>

          <Choice
            name="objective"
            legend={tr("Goal", "লক্ষ্য")}
            defaultValue="sales"
            options={[
              { value: "sales", label: tr("Sales", "বিক্রি") },
              { value: "messages", label: tr("Messages", "মেসেজ") },
              { value: "leads", label: tr("Leads", "লিড") },
              { value: "traffic", label: tr("Website visits", "ওয়েবসাইট ভিজিট") },
            ]}
          />
          <Choice
            name="language"
            legend={tr("Ad language", "অ্যাডের ভাষা")}
            defaultValue={locale === "bn" ? "bn" : "en"}
            options={[
              { value: "bn", label: "বাংলা" },
              { value: "banglish", label: "Banglish" },
              { value: "en", label: "English" },
            ]}
          />
          <Choice
            name="tone"
            legend={tr("Tone", "টোন")}
            defaultValue="friendly"
            options={[
              { value: "friendly", label: tr("Friendly", "বন্ধুসুলভ") },
              { value: "urgent", label: tr("Urgent", "জরুরি") },
              { value: "premium", label: tr("Premium", "প্রিমিয়াম") },
              { value: "playful", label: tr("Playful", "মজার") },
            ]}
          />

          {state && !state.ok && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
            {pending ? tr("Writing…", "লেখা হচ্ছে...") : tr("Write ad copy", "অ্যাডের লেখা বানাও")}
          </button>
          <p className="-mt-2 text-center text-xs text-zinc-400">{quotaText}</p>
        </form>
      </Card>

      <Card className={cn("p-5", pending && "opacity-60")}>
        {result ? (
          <>
            <p className="mb-4 text-xs text-zinc-400">
              {state?.ok ? tr("Just written", "এইমাত্র লেখা") : tr("Your latest set", "তোমার সর্বশেষ লেখা")} ·{" "}
              <span suppressHydrationWarning>{new Date(result.created_at).toLocaleString("en-GB")}</span>
            </p>
            <CopyResult copy={result.content} />
            <p className="mt-6 text-xs text-zinc-400">
              {tr(
                "Check facts and Meta's ad policies before publishing. Numbers show characters; amber means it may be cut off in the feed.",
                "প্রকাশের আগে তথ্য আর Meta-র বিজ্ঞাপন নীতি মিলিয়ে নাও। সংখ্যাগুলো অক্ষরের হিসাব; হলুদ হলে Feed-এ কিছুটা কেটে যেতে পারে।",
              )}
            </p>
          </>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <PenLine className="size-8 text-zinc-300" aria-hidden />
            <p className="mt-3 max-w-sm text-sm text-zinc-500">
              {tr(
                "Describe your product on the left. You'll get 3 primary texts, 5 headlines, 2 descriptions and the best button to use.",
                "বাঁয়ে তোমার পণ্যের কথা লেখো। পাবে ৩টা Primary text, ৫টা Headline, ২টা Description আর কোন বাটন ভালো হবে।",
              )}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
