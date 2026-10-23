import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, cn } from "@/components/ui";
import { Backdrop, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import PricingSection from "@/components/PricingSection";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";

// The public landing page. Frosted glass over soft colour, product snippets instead of
// stock illustrations, and copy written the way an advertiser would say it.

function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass rounded-3xl", className)}>{children}</div>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-zinc-500 uppercase dark:text-zinc-400">
      <span className="h-px w-6 bg-zinc-400/60" aria-hidden />
      {children}
    </p>
  );
}

function Accent({ children }: { children: ReactNode }) {
  return <em className="font-serif font-normal text-indigo-700 italic dark:text-indigo-300">{children}</em>;
}

// ---------- Hero visual: real-looking pieces of the product ----------

function HeroVisual({ tr }: { tr: Tr }) {
  const spark = [12, 18, 15, 22, 19, 27, 24, 31, 29, 36, 33, 41];
  const max = Math.max(...spark);
  const points = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ");
  const hours = [3, 2, 1, 1, 0, 0, 1, 2, 4, 5, 6, 5, 6, 7, 6, 5, 6, 8, 9, 12, 14, 13, 9, 5];

  return (
    <div className="relative grid gap-4 lg:block lg:h-[540px]">
      {/* Main KPI panel */}
      <Glass className="p-5 lg:absolute lg:top-6 lg:right-0 lg:w-[88%]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {tr("Winter Collection · Sales", "Winter Collection · Sales")}
          </p>
          <span className="rounded-full bg-zinc-900/5 px-2.5 py-1 text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
            {tr("Last 7 days", "গত ৭ দিন")}
          </span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            { k: tr("Spent", "খরচ"), v: "$1,284" },
            { k: tr("Purchases", "Purchase"), v: "151" },
            { k: tr("Cost / purchase", "প্রতি Purchase"), v: "$8.51", d: "↓ 12%" },
            { k: "ROAS", v: "3.4x", d: "↑ 0.6" },
          ].map((m) => (
            <div key={m.k}>
              <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{m.k}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">{m.v}</dd>
              <dd className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{m.d ?? " "}</dd>
            </div>
          ))}
        </dl>
        <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="mt-5 h-20 w-full" aria-hidden>
          <defs>
            <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3157b0" stopOpacity="0.28" />
              <stop offset="1" stopColor="#3157b0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,42 ${points} 100,42`} fill="url(#sparkFill)" />
          <polyline points={points} fill="none" stroke="#3157b0" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
      </Glass>

      {/* Alert toast */}
      <Glass className="p-4 lg:absolute lg:top-[290px] lg:left-0 lg:w-[62%]">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-orange shadow-[0_0_0_4px_rgb(255_90_44/0.15)]" aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>{tr("Alert", "অ্যালার্ট")}</span>
              <span>9:02 AM</span>
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">
              {tr("Retargeting is spending, nothing is selling", "Retargeting-এ খরচ হচ্ছে, বিক্রি নেই")}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {tr(
                "$46 in 3 days and zero purchases. It used to bring one every $19.",
                "৩ দিনে $46 খরচ, একটিও Purchase নেই। আগে প্রতি $19-এ একটি আসত।",
              )}
            </p>
          </div>
        </div>
      </Glass>

      {/* Best hours */}
      <Glass className="p-4 lg:absolute lg:top-[300px] lg:right-0 lg:w-[34%]">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{tr("When people buy", "কখন মানুষ কেনে")}</p>
        <div className="mt-3 flex h-16 items-end gap-[3px]" aria-hidden>
          {hours.map((h, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-[2px]", i >= 19 && i <= 21 ? "bg-brand-orange" : "bg-indigo-400/50 dark:bg-indigo-300/40")}
              style={{ height: `${Math.max(6, (h / 14) * 100)}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">{tr("Peak: 7–10 PM", "সবচেয়ে বেশি: রাত ৭–১০টা")}</p>
      </Glass>

      {/* The advice */}
      <Glass className="p-4 lg:absolute lg:top-[430px] lg:left-[14%] lg:w-[70%]">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{tr("This week's move", "এই সপ্তাহে যা করবে")}</p>
        <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
          {tr("Shift $20/day from 35–44 to 18–24. They buy at ", "35–44 থেকে দিনে $20 সরিয়ে 18–24-এ দাও। ওরা কিনছে ")}
          <strong className="font-semibold">$6.10</strong>
          {tr(" instead of ", ", অন্যদিকে ")}
          <strong className="font-semibold">$11.80</strong>
          {tr(".", "-এ।")}
        </p>
      </Glass>
    </div>
  );
}

// ---------- Small product snippets for the feature grid ----------

function AgeBars({ tr }: { tr: Tr }) {
  const rows = [
    { a: "18–24", v: 6.1, w: 38 },
    { a: "25–34", v: 7.9, w: 50 },
    { a: "35–44", v: 11.8, w: 75 },
    { a: "45+", v: 15.7, w: 100 },
  ];
  return (
    <div className="mt-5 space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.a} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">{r.a}</span>
          <span className="h-2 rounded-full bg-zinc-900/5 dark:bg-white/10">
            <span
              className={cn("block h-full rounded-full", i === 0 ? "bg-emerald-500" : "bg-indigo-400/70")}
              style={{ width: `${r.w}%` }}
            />
          </span>
          <span className="text-right tabular-nums text-zinc-700 dark:text-zinc-300">${r.v.toFixed(2)}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-zinc-500">{tr("Cost per purchase by age", "বয়স অনুযায়ী প্রতি Purchase খরচ")}</p>
    </div>
  );
}

function RetentionCurve({ tr }: { tr: Tr }) {
  return (
    <div className="mt-5">
      <svg viewBox="0 0 200 70" className="h-24 w-full" aria-hidden>
        <path d="M0 6 C 20 8, 30 30, 50 34 S 90 44, 120 48 S 170 56, 200 58" fill="none" stroke="#3157b0" strokeWidth="2" />
        <line x1="44" x2="44" y1="0" y2="70" stroke="#ff5a2c" strokeDasharray="3 3" />
        <circle cx="44" cy="31" r="3.5" fill="#ff5a2c" />
      </svg>
      <p className="text-[11px] text-zinc-500">
        {tr("62% leave before second 3. Your hook needs work.", "৬২% দর্শক ৩ সেকেন্ডের আগেই চলে যায়। শুরুটা বদলাতে হবে।")}
      </p>
    </div>
  );
}

function Funnel({ tr }: { tr: Tr }) {
  const steps = [
    { s: tr("Landing page views", "ল্যান্ডিং পেজ ভিউ"), n: "4,120", w: 100 },
    { s: tr("Add to cart", "Add to cart"), n: "612", w: 46 },
    { s: tr("Checkout", "Checkout"), n: "203", w: 24 },
    { s: tr("Purchase", "Purchase"), n: "151", w: 18 },
  ];
  return (
    <div className="mt-5 space-y-1.5">
      {steps.map((st, i) => (
        <div key={st.s} className="flex items-center gap-3 text-xs">
          <span
            className={cn("h-6 rounded-md", i === 1 ? "bg-brand-orange/80" : "bg-indigo-500/25 dark:bg-indigo-300/25")}
            style={{ width: `${st.w}%` }}
          />
          <span className="shrink-0 text-zinc-600 dark:text-zinc-300">
            {st.s} · <span className="tabular-nums">{st.n}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DateChips({ tr }: { tr: Tr }) {
  const chips = [tr("Today", "আজ"), tr("Yesterday", "গতকাল"), tr("Last 7 days", "গত ৭ দিন"), tr("This month", "এই মাস"), tr("Maximum", "সর্বোচ্চ")];
  return (
    <div className="mt-5 flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <span
          key={c}
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            i === 2
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-900/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
          )}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

// ---------- Page ----------

export default async function LandingPage() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in visitors go straight to their dashboard
  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? tr("Open your dashboard", "ড্যাশবোর্ডে যাও") : tr("Connect your ad account", "Ad Account কানেক্ট করো");

  const morning = [
    {
      time: "9:02",
      title: tr("An alert you'd have missed", "যে সমস্যা চোখ এড়িয়ে যেত"),
      text: tr(
        "Your retargeting campaign has spent for three days without a sale. Hook notices before you open Ads Manager.",
        "Retargeting campaign তিন দিন ধরে খরচ করছে, বিক্রি নেই। Ads Manager খোলার আগেই Hook জানিয়ে দেয়।",
      ),
    },
    {
      time: "9:05",
      title: tr("The why, not just the what", "শুধু কী হয়েছে না, কেন হয়েছে"),
      text: tr(
        "Open the campaign report: frequency hit 4.8, the same people have seen the ad too often, and CTR halved.",
        "Campaign report খোলো: Frequency 4.8 হয়ে গেছে, একই মানুষ বারবার দেখছে, CTR অর্ধেক হয়ে গেছে।",
      ),
    },
    {
      time: "9:10",
      title: tr("One clear change", "একটা স্পষ্ট সিদ্ধান্ত"),
      text: tr(
        "Pause it, widen the audience, swap the creative. You're done before your tea gets cold.",
        "বন্ধ করো, audience বড় করো, creative বদলাও। চা ঠান্ডা হওয়ার আগেই কাজ শেষ।",
      ),
    },
  ];

  const never = [
    tr(
      "Touch your ad account without your say-so. Today Hook only reads; when ad launching arrives, nothing goes live until you press Publish.",
      "তোমার অনুমতি ছাড়া Ad Account-এ হাত দেওয়া। এখন Hook শুধু পড়ে; অ্যাড চালুর ফিচার এলেও তুমি Publish না চাপলে কিছুই চালু হবে না।",
    ),
    tr("Make up a number. Every figure comes from Meta and is calculated in code; the AI only explains it.", "নিজে থেকে কোনো সংখ্যা বানানো। সব সংখ্যা Meta থেকে আসে, হিসাব কোডে হয়; AI শুধু ব্যাখ্যা করে।"),
    tr("Sell or share your data. Your Meta token is encrypted and you can disconnect in one click.", "তোমার ডাটা বিক্রি বা শেয়ার করা। Meta token এনক্রিপ্ট করা, আর এক ক্লিকে বিচ্ছিন্ন করা যায়।"),
    tr("Hide a broken pixel behind a pretty ROAS. If tracking looks wrong, we say so first.", "ভুল Pixel-কে সুন্দর ROAS দিয়ে ঢেকে রাখা। ট্র্যাকিং ভুল মনে হলে আগে সেটাই বলি।"),
  ];

  const faq = [
    {
      q: tr("Is my ad account safe?", "আমার Ad Account কি নিরাপদ?"),
      a: tr(
        "Yes. Hook asks Meta for read-only access (ads_read). It can't edit campaigns or budgets. Your access token is encrypted with AES-256, and disconnecting removes the permission and the stored data.",
        "হ্যাঁ। Hook Meta-র কাছে শুধু পড়ার অনুমতি (ads_read) চায়। campaign বা budget বদলাতে পারে না। access token AES-256 দিয়ে এনক্রিপ্ট করা, আর disconnect করলে অনুমতি ও সংরক্ষিত ডাটা মুছে যায়।",
      ),
    },
    {
      q: tr("Will the numbers match Ads Manager?", "সংখ্যা কি Ads Manager-এর সাথে মিলবে?"),
      a: tr(
        "They should, to the cent. Results, reach and frequency come straight from Meta, and days are counted in your ad account's time zone, just like Ads Manager does.",
        "হ্যাঁ, হুবহু। Result, Reach, Frequency সরাসরি Meta থেকে আসে, আর দিন গোনা হয় তোমার Ad Account-এর timezone ধরে, Ads Manager যেভাবে গোনে।",
      ),
    },
    {
      q: tr("Which campaign types work?", "কোন ধরনের campaign চলে?"),
      a: tr(
        "Sales, leads, messages, traffic, engagement and video views. Each campaign's result is counted by its own objective.",
        "Sales, Leads, Messages, Traffic, Engagement আর Video views। প্রতিটি campaign-এর result তার objective অনুযায়ী গোনা হয়।",
      ),
    },
    {
      q: tr("Can I read it in Bangla?", "বাংলায় পড়া যাবে?"),
      a: tr(
        "Yes. Use the EN / বাং switch at the top. The whole app, including AI reports, follows your choice.",
        "হ্যাঁ। উপরের EN / বাং বোতাম দিয়ে বদলাও। AI রিপোর্টসহ পুরো অ্যাপ তোমার পছন্দের ভাষায় চলবে।",
      ),
    },
    {
      q: tr("I manage several ad accounts.", "আমার অনেকগুলো Ad Account আছে।"),
      a: tr(
        "Pick any of them from Settings and switch whenever you like. Search works by name or ID.",
        "Settings থেকে যেকোনোটা বেছে নাও, যখন খুশি বদলাও। নাম বা ID দিয়ে খোঁজা যায়।",
      ),
    },
  ];

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <Backdrop />
      <SiteHeader loggedIn={Boolean(user)} />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <Eyebrow>{tr("For people who run their own Meta ads", "যারা নিজের Meta বিজ্ঞাপন নিজে চালায়")}</Eyebrow>
            <h1 className="hero-title mt-6 text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-zinc-950 sm:text-6xl dark:text-white">
              {tr("Find the money your ads are ", "তোমার বিজ্ঞাপনের যে টাকা ")}
              <Accent>{tr("quietly wasting.", "চুপচাপ নষ্ট হচ্ছে,")}</Accent>
              {tr("", " খুঁজে বের করো।")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
              {tr(
                "Hook reads every campaign in your Meta ad account and tells you, in plain words, who's buying, when they buy, and what to change this week.",
                "Hook তোমার Meta Ad Account-এর প্রতিটি campaign পড়ে সহজ কথায় বলে দেয় কে কিনছে, কখন কিনছে, আর এই সপ্তাহে কী বদলাতে হবে।",
              )}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={primaryHref} className={buttonClass("primary", "rounded-xl px-5 py-3 text-base")}>
                {primaryLabel}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-base font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
              >
                {tr("See a morning with Hook", "Hook-এর সাথে একটা সকাল দেখো")}
              </a>
            </div>
            <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
              {tr("Free plan · No card · Read-only access", "ফ্রি প্ল্যান · কার্ড লাগবে না · শুধু পড়ার অনুমতি")}
            </p>
          </div>
          <HeroVisual tr={tr} />
        </section>

        {/* Plain facts strip */}
        <section aria-label={tr("At a glance", "এক নজরে")} className="px-4 sm:px-6">
          <Glass className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-2xl p-0 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [tr("Read-only", "শুধু পড়ে"), tr("Never edits your ads", "বিজ্ঞাপনে হাত দেয় না")],
              [tr("Matches Ads Manager", "Ads Manager-এর সাথে মেলে"), tr("Same numbers, same time zone", "একই সংখ্যা, একই timezone")],
              [tr("Any currency", "যেকোনো মুদ্রা"), tr("USD, BDT, INR and the rest", "USD, BDT, INR সবই")],
              [tr("English or বাংলা", "English বা বাংলা"), tr("Switch any time", "যখন খুশি বদলাও")],
            ].map(([t, d]) => (
              <div key={t} className="px-5 py-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{t}</p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{d}</p>
              </div>
            ))}
          </Glass>
        </section>

        {/* A morning with Hook */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Eyebrow>{tr("How it works", "কীভাবে কাজ করে")}</Eyebrow>
              <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-zinc-950 dark:text-white">
                {tr("A Monday morning, ", "সোমবার সকাল, ")}
                <Accent>{tr("eight minutes long.", "আট মিনিটে শেষ।")}</Accent>
              </h2>
              <p className="mt-5 text-zinc-600 dark:text-zinc-300">
                {tr(
                  "Connect once with Facebook. After that Hook keeps an eye on every campaign and only speaks up when something actually changed.",
                  "Facebook দিয়ে একবার কানেক্ট করো। এরপর Hook প্রতিটি campaign খেয়াল রাখে, আর সত্যিই কিছু বদলালে তবেই জানায়।",
                )}
              </p>
            </div>
            <ol className="relative space-y-4 before:absolute before:top-4 before:bottom-4 before:left-[2.1rem] before:w-px before:bg-zinc-900/10 dark:before:bg-white/10">
              {morning.map((m) => (
                <li key={m.time} className="relative flex gap-5">
                  <span className="glass relative z-10 flex h-9 w-[4.2rem] shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {m.time}
                  </span>
                  <Glass className="flex-1 rounded-2xl p-5">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{m.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{m.text}</p>
                  </Glass>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features: an uneven grid of real snippets */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6">
          <Eyebrow>{tr("What you get", "যা পাবে")}</Eyebrow>
          <h2 className="mt-5 max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-zinc-950 dark:text-white">
            {tr("Everything Ads Manager knows, ", "Ads Manager যা জানে সব, ")}
            <Accent>{tr("minus the forty columns.", "চল্লিশটা কলাম ছাড়া।")}</Accent>
          </h2>

          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Glass className="p-6 md:col-span-4">
              <h3 className="font-semibold text-zinc-900 dark:text-white">{tr("Who is actually buying", "আসলে কে কিনছে")}</h3>
              <p className="mt-1.5 max-w-md text-sm text-zinc-600 dark:text-zinc-300">
                {tr(
                  "Age, gender, region, placement, device and hour of day, each with its own cost per result, so you can see where the budget earns and where it leaks.",
                  "বয়স, লিঙ্গ, এলাকা, placement, device আর দিনের ঘণ্টা, প্রতিটির আলাদা cost per result। কোথায় টাকা কাজ করছে আর কোথায় নষ্ট হচ্ছে, পরিষ্কার দেখা যায়।",
                )}
              </p>
              <AgeBars tr={tr} />
            </Glass>
            <Glass className="p-6 md:col-span-2">
              <h3 className="font-semibold text-zinc-900 dark:text-white">{tr("Where viewers drop off", "দর্শক কোথায় চলে যায়")}</h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {tr("Hook rate, hold rate and 25–100% views for every video.", "প্রতিটি ভিডিওর Hook rate, Hold rate আর ২৫–১০০% ভিউ।")}
              </p>
              <RetentionCurve tr={tr} />
            </Glass>
            <Glass className="p-6 md:col-span-3">
              <h3 className="font-semibold text-zinc-900 dark:text-white">{tr("Which step loses people", "কোন ধাপে মানুষ হারায়")}</h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {tr(
                  "From landing page to purchase, and a warning when your pixel stops counting a step.",
                  "ল্যান্ডিং পেজ থেকে Purchase পর্যন্ত, আর Pixel কোনো ধাপ গোনা বন্ধ করলে সতর্কতা।",
                )}
              </p>
              <Funnel tr={tr} />
            </Glass>
            <Glass className="flex flex-col p-6 md:col-span-3">
              <h3 className="font-semibold text-zinc-900 dark:text-white">{tr("Any date range, like Ads Manager", "Ads Manager-এর মতো যেকোনো তারিখ")}</h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {tr(
                  "Today, yesterday, a custom range or everything since the account started, compared with the period before.",
                  "আজ, গতকাল, নিজের পছন্দের তারিখ বা অ্যাকাউন্টের শুরু থেকে সব, আগের সময়ের সাথে তুলনাসহ।",
                )}
              </p>
              <DateChips tr={tr} />
              <div className="mt-auto pt-6">
                <p className="rounded-2xl bg-zinc-900/[0.04] p-4 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
                  <span className="mb-1 block text-[11px] text-zinc-500">{tr("Campaign report, in plain words", "Campaign report, সহজ কথায়")}</span>
                  {tr(
                    "“Women 25–34 on Instagram Reels bring 41% of sales for 22% of spend. Give them their own ad set.”",
                    "“Instagram Reels-এ 25–34 বয়সী নারীরা ২২% খরচে ৪১% বিক্রি আনছে। ওদের জন্য আলাদা ad set বানাও।”",
                  )}
                </p>
              </div>
            </Glass>
          </div>
        </section>

        {/* Honesty */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <Glass className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <Eyebrow>{tr("Trust", "বিশ্বাস")}</Eyebrow>
              <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-zinc-950 dark:text-white">
                {tr("Things Hook will ", "যা Hook ")}
                <Accent>{tr("never", "কখনো")}</Accent>
                {tr(" do.", " করবে না।")}
              </h2>
              <p className="mt-5 text-zinc-600 dark:text-zinc-300">
                {tr(
                  "Connecting an ad account is a real decision. Here's exactly what you're agreeing to, and what you're not.",
                  "Ad Account কানেক্ট করা একটা বড় সিদ্ধান্ত। ঠিক কী দিচ্ছ আর কী দিচ্ছ না, পরিষ্কার করে বলছি।",
                )}
              </p>
              <Link href="/privacy" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                {tr("Read the privacy policy", "Privacy policy পড়ো")}
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="divide-y divide-zinc-900/10 dark:divide-white/10">
              {never.map((n) => (
                <li key={n} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900/5 dark:bg-white/10">
                    <Minus className="size-3.5 text-zinc-600 dark:text-zinc-300" aria-hidden />
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{n}</p>
                </li>
              ))}
            </ul>
          </Glass>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6">
          <div className="max-w-2xl">
            <Eyebrow>{tr("Pricing", "দাম")}</Eyebrow>
            <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-zinc-950 dark:text-white">
              {tr("Start free. ", "ফ্রি দিয়ে শুরু করো। ")}
              <Accent>{tr("Pay when it pays off.", "লাভ দেখলে তবেই টাকা দাও।")}</Accent>
            </h2>
            <p className="mt-5 text-zinc-600 dark:text-zinc-300">
              {tr(
                "Every plan reads your ads the same way; bigger plans cover more accounts, more campaigns and more AI work. Items marked soon are on the way.",
                "সব প্ল্যান একইভাবে তোমার বিজ্ঞাপন পড়ে; বড় প্ল্যানে বেশি অ্যাকাউন্ট, বেশি ক্যাম্পেইন আর বেশি AI কাজ। “শীঘ্রই” লেখা ফিচারগুলো আসছে।",
              )}
            </p>
          </div>
          <PricingSection tr={tr} ctaHref={user ? "/settings#plan" : "/login"} />
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-24 sm:px-6">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {tr("Questions people ask us", "মানুষ যা জিজ্ঞেস করে")}
          </h2>
          <div className="mt-10 space-y-3">
            {faq.map(({ q, a }) => (
              <details key={q} className="glass group rounded-2xl px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-xl leading-none text-zinc-400 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section className="px-4 pb-24 sm:px-6">
          <Glass className="mx-auto max-w-6xl px-6 py-16 text-center sm:px-12">
            <h2 className="mx-auto max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
              {tr("Your next ad dollar ", "তোমার পরের বিজ্ঞাপনের টাকা ")}
              <Accent>{tr("deserves a better home.", "আরও ভালো জায়গায় যাক।")}</Accent>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-zinc-600 dark:text-zinc-300">
              {tr(
                "Connect in two minutes. Your first report is ready right after.",
                "দুই মিনিটে কানেক্ট করো। প্রথম রিপোর্ট তৈরি হয়ে যাবে সাথে সাথেই।",
              )}
            </p>
            <Link href={primaryHref} className={buttonClass("primary", "mt-9 rounded-xl px-6 py-3 text-base")}>
              {primaryLabel}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Glass>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
