"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown } from "lucide-react";
import { PRESETS, formatRange, type PresetId } from "@/lib/dates";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";

// Meta Ads Manager-এর মতো তারিখ বাছাই: বাঁয়ে তৈরি সময়সীমা, ডানে নিজের পছন্দের তারিখ
export default function DateRangePicker({
  preset,
  label,
  since,
  until,
  today,
  minDate,
  keepParams,
  basePath = "/dashboard",
}: {
  preset: PresetId | "custom";
  label: string;
  since: string;
  until: string;
  today: string;
  minDate: string;
  // তারিখ বদলালেও বর্তমান ভিউ (ভিডিও, ওয়েবসাইট ইত্যাদি) থেকে যায়
  keepParams: Record<string, string>;
  // কোন পেজে তারিখ বদলাবে (ড্যাশবোর্ড বা ক্যাম্পেইন বিশ্লেষণ)
  basePath?: string;
}) {
  const tr = useTr();
  const ref = useRef<HTMLDetailsElement>(null);
  const extra = new URLSearchParams(keepParams).toString();

  // প্যানেলের বাইরে ক্লিক বা Escape চাপলে বন্ধ
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        className={cn(
          buttonClass("secondary"),
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <CalendarDays className="size-4" aria-hidden />
        <span className="font-semibold">{label}</span>
        <span className="hidden text-zinc-500 sm:inline dark:text-zinc-400">
          {formatRange(since, until)}
        </span>
        <ChevronDown className="size-4 text-zinc-400" aria-hidden />
      </summary>

      {/* ছোট স্ক্রিনে বোতাম বাঁয়ে থাকে, বড় স্ক্রিনে ডানে; প্যানেল সেই দিকেই খোলে */}
      <div className="absolute left-0 z-20 mt-2 flex lg:right-0 lg:left-auto w-[min(92vw,34rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl sm:flex-row dark:border-zinc-800 dark:bg-zinc-900">
        <nav
          aria-label={tr("Preset ranges", "তৈরি সময়সীমা")}
          className="grid grid-cols-2 gap-1 border-b border-zinc-100 p-2 sm:w-44 sm:grid-cols-1 sm:border-r sm:border-b-0 dark:border-zinc-800"
        >
          {PRESETS.map((p) => (
            <Link
              key={p.id}
              href={`${basePath}?preset=${p.id}${extra ? `&${extra}` : ""}`}
              aria-current={p.id === preset ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors",
                p.id === preset
                  ? "bg-indigo-600 font-medium text-white dark:bg-indigo-500"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {tr(p.en, p.bn)}
            </Link>
          ))}
        </nav>

        <form action={basePath} method="get" className="flex flex-1 flex-col gap-3 p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{tr("Custom range", "কাস্টম তারিখ")}</p>
          {Object.entries(keepParams).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{tr("Start", "শুরু")}</span>
            <input
              type="date"
              name="since"
              required
              min={minDate}
              max={today}
              defaultValue={since}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{tr("End", "শেষ")}</span>
            <input
              type="date"
              name="until"
              min={minDate}
              max={today}
              defaultValue={preset === "custom" ? until : ""}
              className={inputClass}
            />
          </label>
          <p className="text-xs text-zinc-400">
            {tr("Leave “End” empty to see a single day. Earliest: ", "শুধু এক দিন দেখতে “শেষ” খালি রাখো। সবচেয়ে পুরনো: ")}
            {formatRange(minDate, minDate)}
          </p>
          <button type="submit" className={buttonClass("primary", "mt-auto")}>
            {tr("Apply", "প্রয়োগ করো")}
          </button>
        </form>
      </div>
    </details>
  );
}
