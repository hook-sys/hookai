import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, KeyRound, Lock, ShieldCheck, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import PricingSection from "@/components/PricingSection";
import ProductTour from "@/components/landing/ProductTour";
import { BrowserFrame, DashboardMock } from "@/components/landing/Mocks";
import { getTr } from "@/lib/i18n-server";

// The public landing page. One promise, the real product on screen, honest proof,
// and the same call to action at every natural stopping point.

function H2({ children, dark = false, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <h2
      className={cn(
        "text-3xl leading-[1.12] font-semibold tracking-[-0.03em] sm:text-[2.6rem]",
        dark ? "text-white" : "text-zinc-950 dark:text-white",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function PrimaryCta({ href, children, onDark = false }: { href: string; children: ReactNode; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold transition-colors",
        onDark ? "bg-white text-zinc-950 hover:bg-zinc-100" : "bg-[#3157B0] text-white hover:bg-[#2a4a96]",
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export default async function LandingPage() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in visitors go straight to their dashboard
  const ctaHref = user ? "/dashboard" : "/signup";
  const ctaLabel = user ? tr("Open your dashboard", "ড্যাশবোর্ডে যাও") : tr("Start free with your ad account", "তোমার Ad Account দিয়ে ফ্রি শুরু করো");

  const proof = [
    { v: tr("To the cent", "হুবহু"), k: tr("Numbers match Ads Manager, in your time zone", "Ads Manager-এর সাথে মেলে, তোমার timezone-এ") },
    { v: "7", k: tr("Breakdowns: age, gender, region, placement, device, hour, weekday", "ব্রেকডাউন: বয়স, লিঙ্গ, এলাকা, প্লেসমেন্ট, ডিভাইস, ঘণ্টা, বার") },
    { v: tr("2 min", "২ মিনিট"), k: tr("From sign-up to your first report", "অ্যাকাউন্ট খোলা থেকে প্রথম রিপোর্ট") },
    { v: "EN · বাং", k: tr("Every screen and report in either language", "প্রতিটি পর্দা আর রিপোর্ট দুই ভাষায়") },
  ];

  const compare = [
    {
      before: tr("40+ columns and you still don't know what to do", "৪০টার বেশি কলাম, তবু বোঝা যায় না কী করতে হবে"),
      after: tr("Seven numbers and a plain-language next step", "সাতটা সংখ্যা আর সহজ ভাষায় পরের পদক্ষেপ"),
    },
    {
      before: tr("You find wasted spend days later, if at all", "টাকা নষ্ট হচ্ছে, টের পাও কয়েক দিন পরে, নয়তো কখনোই না"),
      after: tr("An alert the morning it starts", "যেদিন শুরু, সেদিন সকালেই অ্যালার্ট"),
    },
    {
      before: tr("Breakdowns hidden three menus deep", "ব্রেকডাউন তিনটা মেনুর ভেতরে লুকানো"),
      after: tr("Best and worst audience picked out for each campaign", "প্রতিটি ক্যাম্পেইনের সেরা আর দুর্বল অডিয়েন্স আলাদা করে দেখানো"),
    },
    {
      before: tr("A broken pixel quietly inflates your ROAS", "ভুল Pixel চুপচাপ ROAS বাড়িয়ে দেখায়"),
      after: tr("Tracking problems flagged before you trust the number", "সংখ্যা বিশ্বাস করার আগেই ট্র্যাকিং সমস্যা ধরিয়ে দেয়"),
    },
  ];

  const steps = [
    { n: "01", t: tr("Create your account", "অ্যাকাউন্ট খোলো"), d: tr("Email and password. No card.", "ইমেইল আর পাসওয়ার্ড। কার্ড লাগবে না।"), time: tr("30 sec", "৩০ সেকেন্ড") },
    { n: "02", t: tr("Connect Facebook", "Facebook কানেক্ট করো"), d: tr("Approve read-only access and pick an ad account.", "শুধু পড়ার অনুমতি দাও, একটা Ad Account বেছে নাও।"), time: tr("1 min", "১ মিনিট") },
    { n: "03", t: tr("Read your first report", "প্রথম রিপোর্ট পড়ো"), d: tr("Dashboard, alerts and AI advice are ready right away.", "ড্যাশবোর্ড, অ্যালার্ট আর AI পরামর্শ সাথে সাথে তৈরি।"), time: tr("Instant", "সাথে সাথে") },
  ];

  const audiences = [
    {
      t: tr("Shop owners", "দোকান ও পেজের মালিক"),
      d: tr("You boost posts and run sales campaigns yourself. Hook tells you which ones pay for themselves.", "নিজেই পোস্ট বুস্ট করো আর সেলস ক্যাম্পেইন চালাও। Hook বলে কোনগুলো আসলে লাভ আনছে।"),
      plan: "Free · Solo",
    },
    {
      t: tr("Freelance marketers", "ফ্রিল্যান্স মার্কেটার"),
      d: tr("You run ads for a few clients. One place to check every account and a report you can send.", "কয়েকজন ক্লায়েন্টের বিজ্ঞাপন চালাও। সব অ্যাকাউন্ট এক জায়গায়, আর পাঠানোর মতো রিপোর্ট।"),
      plan: "Pro Marketer",
    },
    {
      t: tr("Agencies", "এজেন্সি"),
      d: tr("Dozens of accounts, a team, and clients who want answers. Hook does the first read for you.", "অনেক অ্যাকাউন্ট, টিম, আর উত্তর চাওয়া ক্লায়েন্ট। প্রথম বিশ্লেষণটা Hook করে দেয়।"),
      plan: "Agency",
    },
  ];

  const trust = [
    { i: Eye, t: tr("Read-only", "শুধু পড়ে"), d: tr("Hook can't change, pause or create ads.", "Hook বিজ্ঞাপন বদলাতে, বন্ধ করতে বা বানাতে পারে না।") },
    { i: KeyRound, t: tr("Encrypted token", "এনক্রিপ্টেড token"), d: tr("Your Meta token is stored with AES-256.", "Meta token AES-256 দিয়ে এনক্রিপ্ট করা।") },
    { i: Lock, t: tr("Only yours", "শুধু তোমার"), d: tr("Each account sees only its own data.", "প্রতিটি অ্যাকাউন্ট শুধু নিজের ডাটা দেখে।") },
    { i: Trash2, t: tr("Delete anytime", "যখন খুশি মুছে ফেলো"), d: tr("Disconnect or delete everything in one click.", "এক ক্লিকে বিচ্ছিন্ন বা সব মুছে ফেলো।") },
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
      q: tr("Does the AI make up numbers?", "AI কি নিজে থেকে সংখ্যা বানায়?"),
      a: tr(
        "No. Every figure is calculated in code from Meta's data. The AI only explains what the numbers mean and suggests what to do, and every suggestion shows the numbers behind it.",
        "না। প্রতিটি সংখ্যা Meta-র ডাটা থেকে কোডে হিসাব করা। AI শুধু সংখ্যার মানে বোঝায় আর পরামর্শ দেয়, প্রতিটি পরামর্শের সাথে কারণ হিসেবে সংখ্যাও থাকে।",
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
      q: tr("Do I need a card to start?", "শুরু করতে কি কার্ড লাগবে?"),
      a: tr(
        "No. The Free plan needs only an email. Upgrade later if you want more accounts, campaigns or AI reports.",
        "না। Free প্ল্যানে শুধু ইমেইল লাগে। বেশি অ্যাকাউন্ট, ক্যাম্পেইন বা AI রিপোর্ট লাগলে পরে প্ল্যান বাড়াও।",
      ),
    },
  ];

  return (
    <div className={cn("min-h-screen bg-[#f6f5f1] dark:bg-[#0b0d12]", !user && "pb-20 sm:pb-0")}>
      <SiteHeader loggedIn={Boolean(user)} tone="ink" />

      <main>
        {/* Hero */}
        <section className="ink overflow-hidden">
          <div className="mx-auto max-w-6xl px-4 pt-16 pb-0 text-center sm:px-6 sm:pt-24">
            <p className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2 text-sm font-medium text-zinc-200 sm:text-base">
              <span className="size-2 rounded-full bg-emerald-400" aria-hidden />
              {tr("For anyone who runs their own Facebook & Instagram ads", "যারা নিজের Facebook ও Instagram বিজ্ঞাপন নিজে চালায়")}
            </p>
            <h1 className="hero-title mx-auto mt-6 max-w-4xl text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.4rem]">
              {tr("Stop guessing which ads ", "কোন বিজ্ঞাপন টাকা আনছে, ")}
              <span className="text-[#FF7A4D]">{tr("make you money.", "আর আন্দাজ নয়।")}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              {tr(
                "Hook reads your Meta ad account and tells you, in plain words, what's working, what's leaking money, and exactly what to change next.",
                "Hook তোমার Meta Ad Account পড়ে সহজ কথায় বলে দেয় কী কাজ করছে, কোথায় টাকা নষ্ট হচ্ছে, আর এরপর ঠিক কী বদলাতে হবে।",
              )}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta href={ctaHref} onDark>
                {ctaLabel}
              </PrimaryCta>
              <a href="#tour" className="rounded-xl px-5 py-3.5 text-base font-medium text-zinc-300 hover:text-white">
                {tr("See the product", "প্রোডাক্ট দেখো")}
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-400">
              {[tr("Free plan", "ফ্রি প্ল্যান"), tr("No card needed", "কার্ড লাগবে না"), tr("Read-only access", "শুধু পড়ার অনুমতি")].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-emerald-400" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>

            <div className="relative mx-auto mt-14 max-w-5xl">
              <BrowserFrame className="rounded-b-none border-b-0">
                <DashboardMock />
              </BrowserFrame>
            </div>
          </div>
        </section>

        {/* Honest proof */}
        <section aria-label={tr("At a glance", "এক নজরে")} className="border-b border-zinc-900/5 bg-white dark:border-white/5 dark:bg-[#0f1219]">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-zinc-900/5 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x dark:divide-white/5">
            {proof.map((p) => (
              <div key={p.k} className="px-2 py-8 lg:px-8">
                <dt className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">{p.v}</dt>
                <dd className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{p.k}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Before / after */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <H2>{tr("Ads Manager tells you what happened. Hook tells you what to do.", "Ads Manager বলে কী হয়েছে। Hook বলে এখন কী করতে হবে।")}</H2>
          </div>
          <div className="mt-12 overflow-hidden rounded-2xl border border-zinc-900/10 bg-white dark:border-white/10 dark:bg-[#12151d]">
            <div className="grid grid-cols-2 border-b border-zinc-900/10 text-sm font-semibold dark:border-white/10">
              <p className="px-5 py-3 text-zinc-500">{tr("Ads Manager alone", "শুধু Ads Manager")}</p>
              <p className="border-l border-zinc-900/10 px-5 py-3 text-[#3157B0] dark:border-white/10 dark:text-[#8fa8e6]">{tr("With Hook", "Hook-এর সাথে")}</p>
            </div>
            {compare.map((c) => (
              <div key={c.after} className="grid grid-cols-2 border-b border-zinc-900/5 last:border-b-0 dark:border-white/5">
                <p className="flex gap-2.5 px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                  <X className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                  {c.before}
                </p>
                <p className="flex gap-2.5 border-l border-zinc-900/10 px-5 py-4 text-sm font-medium text-zinc-900 dark:border-white/10 dark:text-zinc-100">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {c.after}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Product tour */}
        <section id="tour" className="scroll-mt-20 border-y border-zinc-900/5 bg-white py-24 dark:border-white/5 dark:bg-[#0f1219]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <H2>{tr("Everything you need to decide, nothing you don't.", "সিদ্ধান্ত নিতে যা দরকার সব, বাড়তি কিছু নয়।")}</H2>
            </div>
            <ProductTour />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <H2>{tr("From sign-up to your first answer in about two minutes.", "অ্যাকাউন্ট খোলা থেকে প্রথম উত্তর, মোটামুটি দুই মিনিটে।")}</H2>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="rounded-2xl border border-zinc-900/10 bg-white p-6 dark:border-white/10 dark:bg-[#12151d]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-zinc-400">{s.n}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{s.time}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-zinc-950 dark:text-white">{s.t}</h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <PrimaryCta href={ctaHref}>{ctaLabel}</PrimaryCta>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-y border-zinc-900/5 bg-white py-24 dark:border-white/5 dark:bg-[#0f1219]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <H2>{tr("Built for the people who actually press Publish.", "যারা নিজের হাতে Publish চাপে, তাদের জন্য।")}</H2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {audiences.map((a) => (
                <div key={a.t} className="flex flex-col rounded-2xl border border-zinc-900/10 p-6 dark:border-white/10">
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">{a.t}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{a.d}</p>
                  <p className="mt-6 text-xs font-medium text-[#3157B0] dark:text-[#8fa8e6]">{tr("Best plan", "উপযুক্ত প্ল্যান")}: {a.plan}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <H2>{tr("Start free. Upgrade when it pays for itself.", "ফ্রি দিয়ে শুরু করো। লাভ দেখলে তবেই প্ল্যান বাড়াও।")}</H2>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              {tr(
                "Every plan reads your ads the same way. Bigger plans cover more accounts, more campaigns and more AI work.",
                "সব প্ল্যান একইভাবে তোমার বিজ্ঞাপন পড়ে। বড় প্ল্যানে বেশি অ্যাকাউন্ট, বেশি ক্যাম্পেইন আর বেশি AI কাজ।",
              )}
            </p>
          </div>
          <PricingSection tr={tr} ctaHref={user ? "/settings#plan" : "/signup"} />
        </section>

        {/* Trust */}
        <section className="border-y border-zinc-900/5 bg-white dark:border-white/5 dark:bg-[#0f1219]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <ShieldCheck className="size-8 text-[#3157B0] dark:text-[#8fa8e6]" aria-hidden />
              <H2 className="mt-4 sm:text-3xl">{tr("Your ad account stays yours.", "তোমার Ad Account তোমারই থাকে।")}</H2>
              <Link href="/privacy" className="mt-4 inline-block text-sm font-medium text-[#3157B0] hover:underline dark:text-[#8fa8e6]">
                {tr("Read the privacy policy →", "Privacy policy পড়ো →")}
              </Link>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2">
              {trust.map(({ i: Icon, t, d }) => (
                <li key={t}>
                  <Icon className="size-5 text-zinc-900 dark:text-zinc-100" aria-hidden />
                  <p className="mt-3 font-semibold text-zinc-950 dark:text-white">{t}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
          <H2>{tr("Questions before you connect", "কানেক্ট করার আগে যা জানতে চাও")}</H2>
          <div className="mt-10 divide-y divide-zinc-900/10 border-y border-zinc-900/10 dark:divide-white/10 dark:border-white/10">
            {faq.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-zinc-950 dark:text-white [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-2xl leading-none text-zinc-400 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 pr-8 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section className="ink">
          <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
            <h2 className="text-3xl leading-tight font-semibold tracking-[-0.03em] text-white sm:text-5xl">
              {tr("Your next taka of ad spend should know where it's going.", "তোমার বিজ্ঞাপনের পরের টাকাটা কোথায় যাচ্ছে, জেনে খরচ করো।")}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-zinc-400">
              {tr("Connect in two minutes. Free plan, no card, read-only.", "দুই মিনিটে কানেক্ট। ফ্রি প্ল্যান, কার্ড লাগবে না, শুধু পড়ার অনুমতি।")}
            </p>
            <div className="mt-9">
              <PrimaryCta href={ctaHref} onDark>
                {ctaLabel}
              </PrimaryCta>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Mobile: the call to action is always one tap away */}
      {!user && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-900/10 bg-white/95 p-3 backdrop-blur sm:hidden dark:border-white/10 dark:bg-[#0b0d12]/95">
          <Link
            href="/signup"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3157B0] py-3 text-base font-semibold text-white"
          >
            {tr("Start free", "ফ্রি শুরু করো")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
