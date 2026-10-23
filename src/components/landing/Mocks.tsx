"use client";

import type { ReactNode } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  Copy,
  FileText,
  LayoutDashboard,
  PenLine,
  Settings,
  Sparkles,
} from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { LogoMark, cn } from "@/components/ui";

// Product screens drawn in code with sample numbers. They follow the real app's layout,
// so what people see here is what they get after signing up.

export function BrowserFrame({ children, url = "www.hook.com.bd/dashboard", className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-[#0f131c] shadow-[0_40px_120px_-40px_rgba(49,87,176,0.55)]", className)}>
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 truncate rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-zinc-400">{url}</span>
      </div>
      <div className="bg-zinc-50 text-zinc-900">{children}</div>
    </div>
  );
}

function SampleTag() {
  const tr = useTr();
  return (
    <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500">
      {tr("Sample data", "নমুনা ডাটা")}
    </span>
  );
}

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function DashboardMock() {
  const tr = useTr();
  const days = [
    { s: 142, p: 14 },
    { s: 168, p: 18 },
    { s: 151, p: 17 },
    { s: 190, p: 26 },
    { s: 205, p: 29 },
    { s: 214, p: 24 },
    { s: 214, p: 23 },
  ];
  const maxS = Math.max(...days.map((d) => d.s));
  const rows = [
    { n: "Winter Jacket · Broad", r: 64, cpr: 6.1, tone: "good" },
    { n: "Retargeting · 30d", r: 41, cpr: 7.4, tone: "good" },
    { n: "Lookalike 1% BD", r: 29, cpr: 11.8, tone: "bad" },
    { n: "Reels · Creative test", r: 17, cpr: 9.2, tone: "mid" },
  ] as const;

  return (
    <div className="flex text-left">
      <aside className="hidden w-40 shrink-0 border-r border-zinc-200 bg-white p-3 sm:block">
        <div className="mb-5 flex items-center gap-2">
          <LogoMark className="size-6" />
          <span className="text-[11px] font-bold text-[#3157B0]">
            HOOK <span className="text-[#FF5A2C]">AI</span>
          </span>
        </div>
        {[
          { i: LayoutDashboard, l: tr("Dashboard", "ড্যাশবোর্ড"), a: true },
          { i: FileText, l: tr("Reports", "রিপোর্ট") },
          { i: PenLine, l: tr("Ad copy", "অ্যাডের লেখা") },
          { i: Settings, l: tr("Settings", "সেটিংস") },
        ].map(({ i: Icon, l, a }) => (
          <div key={l} className={cn("mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]", a ? "bg-indigo-50 font-medium text-indigo-700" : "text-zinc-500")}>
            <Icon className="size-3.5" aria-hidden />
            {l}
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Winter Collection BD</p>
            <p className="text-[10px] text-zinc-500">{tr("Last 7 days · vs previous 7 days", "গত ৭ দিন · আগের ৭ দিনের তুলনায়")}</p>
          </div>
          <SampleTag />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { k: "Result", v: "151", d: "+38%", good: true, sub: "Purchase" },
            { k: "Cost per Result", v: "$8.51", d: "−12%", good: true },
            { k: "Reach", v: "50,138", d: "+21%", good: true },
            { k: tr("Amount spent", "খরচ"), v: "$1,284", d: "+9%", good: null },
          ].map((m) => (
            <div key={m.k} className="rounded-lg border border-zinc-200 bg-white p-2.5">
              <p className="text-[10px] text-zinc-500">{m.k}</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{m.v}</p>
              <p className={cn("text-[10px] tabular-nums", m.good === null ? "text-zinc-400" : m.good ? "text-emerald-600" : "text-red-600")}>{m.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid gap-2 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-[10px] text-zinc-500">{tr("Spend and purchases by day", "দিন অনুযায়ী খরচ ও Purchase")}</p>
            <div className="mt-2 flex h-20 items-end gap-1.5" aria-hidden>
              {days.map((d, i) => (
                <div key={i} className="relative flex h-full flex-1 items-end">
                  <span className="w-full rounded-sm bg-indigo-100" style={{ height: `${(d.s / maxS) * 100}%` }} />
                  <span className="absolute inset-x-1 bottom-0 rounded-sm bg-[#3157B0]" style={{ height: `${(d.p / 30) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700">
              <Sparkles className="size-3" aria-hidden /> {tr("AI summary", "AI সারসংক্ষেপ")}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-700">
              {tr(
                "Purchases up 38% while cost per purchase fell to $8.51. Lookalike 1% costs almost twice the rest: move $15/day to Broad.",
                "Purchase ৩৮% বেড়েছে, প্রতি Purchase খরচ কমে $8.51। Lookalike 1%-এ খরচ প্রায় দ্বিগুণ: দিনে $15 Broad-এ সরাও।",
              )}
            </p>
          </div>
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="grid grid-cols-[1fr_3.5rem_4.5rem] gap-2 border-b border-zinc-100 bg-zinc-50 px-2.5 py-1.5 text-[10px] text-zinc-500">
            <span>{tr("Campaign", "ক্যাম্পেইন")}</span>
            <span className="text-right">Result</span>
            <span className="text-right">Cost/Result</span>
          </div>
          {rows.map((r) => (
            <div key={r.n} className="grid grid-cols-[1fr_3.5rem_4.5rem] items-center gap-2 border-b border-zinc-100 px-2.5 py-1.5 text-[11px] last:border-b-0">
              <span className="truncate">{r.n}</span>
              <span className="text-right tabular-nums">{r.r}</span>
              <span className="text-right">
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    r.tone === "good" ? "bg-emerald-50 text-emerald-700" : r.tone === "bad" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
                  )}
                >
                  {money(r.cpr)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReportMock() {
  const tr = useTr();
  return (
    <div className="p-5 text-left">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">{tr("Campaign report", "ক্যাম্পেইন রিপোর্ট")}</span>
        <SampleTag />
      </div>
      <p className="mt-3 text-base font-semibold leading-snug">
        {tr(
          "Women 25–34 on Instagram Reels bring 41% of sales for 22% of the spend.",
          "Instagram Reels-এ ২৫–৩৪ বয়সী নারীরা ২২% খরচে ৪১% বিক্রি আনছে।",
        )}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { k: tr("Best age", "সেরা বয়স"), v: "25–34", s: "$6.10" },
          { k: tr("Best placement", "সেরা প্লেসমেন্ট"), v: "IG Reels", s: "$5.80" },
          { k: tr("Best hours", "সেরা সময়"), v: "8–11 PM", s: "$6.40" },
        ].map((x) => (
          <div key={x.k} className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-[10px] text-zinc-500">{x.k}</p>
            <p className="mt-0.5 text-sm font-semibold">{x.v}</p>
            <p className="text-[10px] text-emerald-600">{tr(`${x.s} per purchase`, `প্রতি Purchase ${x.s}`)}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] font-semibold text-zinc-900">{tr("What to do now", "এখন কী করবে")}</p>
      <ul className="mt-2 space-y-1.5">
        {[
          { t: tr("Give women 25–34 on Reels their own ad set", "Reels-এ ২৫–৩৪ বয়সী নারীদের আলাদা ad set দাও"), p: tr("Important", "গুরুত্বপূর্ণ"), c: "bg-amber-50 text-amber-700" },
          { t: tr("Cut delivery between 1 AM and 7 AM", "রাত ১টা থেকে সকাল ৭টা বিজ্ঞাপন কমাও"), p: tr("Important", "গুরুত্বপূর্ণ"), c: "bg-amber-50 text-amber-700" },
          { t: tr("Fix the Initiate checkout event: it fires less than Purchase", "Initiate checkout ইভেন্ট ঠিক করো: Purchase-এর চেয়েও কম গুনছে"), p: tr("Urgent", "জরুরি"), c: "bg-red-50 text-red-700" },
        ].map((a) => (
          <li key={a.t} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[11px]">
            <span>{a.t}</span>
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px]", a.c)}>{a.p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlertsMock() {
  const tr = useTr();
  const alerts = [
    {
      high: true,
      t: tr("Spending, but no results", "খরচ হচ্ছে, কিন্তু কোনো ফলাফল নেই"),
      c: "Retargeting · 30d",
      m: tr("$46 spent in the last 3 days without a single purchase. It used to bring one every $19.", "গত ৩ দিনে $46 খরচ, একটিও Purchase নেই। আগে প্রতি $19-এ একটি আসত।"),
    },
    {
      high: false,
      t: tr("Cost per Purchase up 64%", "Cost per Purchase ৬৪% বেড়েছে"),
      c: "Lookalike 1% BD",
      m: tr("Each purchase cost $11.80 over the last 3 days, up from $7.20.", "গত ৩ দিনে প্রতি Purchase $11.80, আগে ছিল $7.20।"),
    },
    {
      high: false,
      t: tr("CTR down 41%", "CTR ৪১% কমেছে"),
      c: "Reels · Creative test",
      m: tr("The ad may be wearing out; try a fresh creative.", "বিজ্ঞাপন পুরনো হয়ে যেতে পারে, নতুন ক্রিয়েটিভ পরীক্ষা করো।"),
    },
  ];
  return (
    <div className="p-5 text-left">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Bell className="size-4 text-red-600" aria-hidden /> {tr("Alerts", "অ্যালার্ট")}
        </p>
        <SampleTag />
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => {
          const Icon = a.high ? AlertOctagon : AlertTriangle;
          return (
            <li key={a.t} className="flex gap-2.5 rounded-lg border border-zinc-200 bg-white p-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", a.high ? "text-red-600" : "text-amber-600")} aria-hidden />
              <div className="min-w-0">
                <p className="text-[12px] font-medium">{a.t}</p>
                <p className="text-[10px] text-zinc-500">{a.c}</p>
                <p className="mt-1 text-[11px] text-zinc-600">{a.m}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdCopyMock() {
  const tr = useTr();
  const heads = [
    tr("Rain or cold, you're covered", "বৃষ্টি হোক বা শীত, নিশ্চিন্ত"),
    tr("Waterproof jacket, ৳1,850", "ওয়াটারপ্রুফ জ্যাকেট, ৳১,৮৫০"),
    tr("Free delivery in Dhaka", "ঢাকায় ফ্রি ডেলিভারি"),
  ];
  return (
    <div className="p-5 text-left">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <PenLine className="size-4 text-indigo-600" aria-hidden /> {tr("Ad copy", "অ্যাডের লেখা")}
        </p>
        <SampleTag />
      </div>
      <p className="mt-3 text-[10px] font-semibold text-zinc-500">Primary text</p>
      <div className="mt-1 flex gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <p className="flex-1 text-[12px] leading-snug whitespace-pre-line">
          {tr(
            "Dhaka's winter doesn't wait. Neither should you. 🧥\nOur waterproof jacket keeps out wind and drizzle, M to XXL, ৳1,850 with cash on delivery.",
            "ঢাকার শীত অপেক্ষা করে না, তুমিও কোরো না। 🧥\nওয়াটারপ্রুফ জ্যাকেট, বাতাস আর হালকা বৃষ্টি আটকায়। সাইজ M–XXL, ৳১,৮৫০, ক্যাশ অন ডেলিভারি।",
          )}
        </p>
        <Copy className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
      </div>
      <p className="mt-3 text-[10px] font-semibold text-zinc-500">Headline</p>
      <ul className="mt-1 space-y-1.5">
        {heads.map((h) => (
          <li key={h} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px]">
            <span>{h}</span>
            <span className="text-[10px] tabular-nums text-zinc-400">{[...h].length}/40</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Check className="size-3.5 text-emerald-600" aria-hidden />
        {tr("Best button: Order now", "সেরা বাটন: Order now")}
        <BarChart3 className="ml-auto size-3.5 text-zinc-300" aria-hidden />
      </p>
    </div>
  );
}
