"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Languages, Loader2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import type { Locale } from "@/lib/i18n";
import { translateReportAction } from "../../actions";

const NAMES: Record<Locale, string> = { en: "English", bn: "বাংলা" };

function TranslateButton({ to }: { to: Locale }) {
  const tr = useTr();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-700"
      title={tr(`Translate this report to ${NAMES[to]}`, `রিপোর্টটি ${NAMES[to]}-য় অনুবাদ করো`)}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Languages className="size-3.5" aria-hidden />}
      {pending ? tr("Translating…", "অনুবাদ হচ্ছে...") : NAMES[to]}
    </button>
  );
}

// রিপোর্টের ভাষা: যে ভাষায় আছে সেটি সরাসরি, অন্যটি প্রথমবার AI অনুবাদ করে
export default function ReportLanguage({
  kind,
  id,
  shown,
  available,
}: {
  kind: string;
  id: string;
  shown: Locale;
  available: Locale[];
}) {
  const tr = useTr();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{tr("Report language", "রিপোর্টের ভাষা")}:</span>
      <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {(["en", "bn"] as const).map((l) =>
          l === shown ? (
            <span key={l} aria-current="true" className="rounded-md bg-white px-3 py-1 font-medium shadow-sm dark:bg-zinc-900">
              {NAMES[l]}
            </span>
          ) : available.includes(l) ? (
            <Link
              key={l}
              href={`/reports/${kind}/${id}?lang=${l}`}
              className={cn("rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-700")}
            >
              {NAMES[l]}
            </Link>
          ) : (
            <form key={l} action={translateReportAction}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="to" value={l} />
              <TranslateButton to={l} />
            </form>
          ),
        )}
      </div>
    </div>
  );
}
