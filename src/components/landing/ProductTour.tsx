"use client";

import { useState } from "react";
import { Bell, Check, FileText, LayoutDashboard, PenLine, type LucideIcon } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import { AdCopyMock, AlertsMock, BrowserFrame, DashboardMock, ReportMock } from "./Mocks";

type TabId = "dashboard" | "report" | "alerts" | "copy";

// One feature at a time, each with the real screen next to it
export default function ProductTour() {
  const tr = useTr();
  const [tab, setTab] = useState<TabId>("report");

  const tabs: { id: TabId; icon: LucideIcon; label: string; title: string; points: string[]; url: string }[] = [
    {
      id: "report",
      icon: FileText,
      label: tr("Campaign report", "ক্যাম্পেইন রিপোর্ট"),
      title: tr("Who buys, when, and what to change", "কে কেনে, কখন কেনে, আর কী বদলাতে হবে"),
      points: [
        tr("Best and worst age, gender, region, placement, device and hour", "সেরা ও দুর্বল বয়স, লিঙ্গ, এলাকা, প্লেসমেন্ট, ডিভাইস আর সময়"),
        tr("Where viewers leave your video and where shoppers leave your site", "ভিডিওর কোথায় দর্শক চলে যায়, সাইটের কোন ধাপে ক্রেতা হারায়"),
        tr("Saved, translatable, and downloadable as PDF or CSV", "জমা থাকে, অনুবাদ করা যায়, PDF বা CSV-তে নামানো যায়"),
      ],
      url: "www.hook.com.bd/reports",
    },
    {
      id: "alerts",
      icon: Bell,
      label: tr("Alerts", "অ্যালার্ট"),
      title: tr("Know about wasted spend before it adds up", "টাকা নষ্ট হওয়া জমে ওঠার আগেই জানো"),
      points: [
        tr("Spending with no results, rising cost per purchase or lead", "খরচ হচ্ছে কিন্তু ফল নেই, Purchase বা Lead-এর খরচ বাড়ছে"),
        tr("Falling CTR that signals a tired creative", "CTR কমছে, মানে ক্রিয়েটিভ পুরনো হয়ে যাচ্ছে"),
        tr("Sudden spend spikes after a budget change", "বাজেট বদলের পর হঠাৎ বেশি খরচ"),
      ],
      url: "www.hook.com.bd/dashboard",
    },
    {
      id: "copy",
      icon: PenLine,
      label: tr("Ad copy", "অ্যাডের লেখা"),
      title: tr("Ad copy that sounds like your customers", "তোমার ক্রেতার ভাষায় অ্যাডের লেখা"),
      points: [
        tr("Primary text, headlines, descriptions and the right button", "Primary text, Headline, Description আর সঠিক বাটন"),
        tr("Bangla, Banglish or English, in the tone you choose", "বাংলা, Banglish বা English, পছন্দের টোনে"),
        tr("Character counts so nothing gets cut off in the feed", "অক্ষর গোনা, যাতে Feed-এ কিছু কেটে না যায়"),
      ],
      url: "www.hook.com.bd/ad-copy",
    },
    {
      id: "dashboard",
      icon: LayoutDashboard,
      label: tr("Dashboard", "ড্যাশবোর্ড"),
      title: tr("The seven numbers that matter, on one screen", "যে সাতটা সংখ্যা আসলে দরকার, এক পর্দায়"),
      points: [
        tr("Result, cost per result, reach, frequency, CTR, spend and budget", "Result, Cost per Result, Reach, Frequency, CTR, খরচ আর বাজেট"),
        tr("Any date range, compared with the period before", "যেকোনো তারিখ, আগের সময়ের সাথে তুলনাসহ"),
        tr("Campaigns coloured by how cheaply they bring results", "কোন ক্যাম্পেইন কত সস্তায় ফল আনছে, রং দেখেই বোঝা যায়"),
      ],
      url: "www.hook.com.bd/dashboard",
    },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <div>
      <div role="tablist" aria-label={tr("Product tour", "প্রোডাক্ট ট্যুর")} className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-900/10 bg-white p-1 dark:border-white/10 dark:bg-white/5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`tour-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                on ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div id={`tour-${active.id}`} role="tabpanel" className="mt-8 grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">{active.title}</h3>
          <ul className="mt-6 space-y-3">
            {active.points.map((p) => (
              <li key={p} className="flex gap-3 text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3157B0] text-white">
                  <Check className="size-3" aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <BrowserFrame url={active.url}>
          {active.id === "dashboard" && <DashboardMock />}
          {active.id === "report" && <ReportMock />}
          {active.id === "alerts" && <AlertsMock />}
          {active.id === "copy" && <AdCopyMock />}
        </BrowserFrame>
      </div>
    </div>
  );
}
