import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Link2,
  Lock,
  PieChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo, LogoMark, buttonClass, cn } from "@/components/ui";

// লগইনের আগের পেজ। ভাষা বাংলা, বিজ্ঞাপনের শব্দগুলো (ROAS, Pixel ইত্যাদি) ইংরেজিতে, মানুষ যেভাবে বলে।

const PROBLEMS: { icon: LucideIcon; problem: string; solution: string }[] = [
  {
    icon: Target,
    problem: "কোন বয়স, এলাকা বা সময়ে বিক্রি হচ্ছে, জানো না",
    solution: "প্রতিটি campaign-এর age, gender, placement আর ঘণ্টা ধরে বিশ্লেষণ, সেরা অংশ আলাদা করে দেখায়",
  },
  {
    icon: TrendingDown,
    problem: "Pixel ভুল ট্র্যাক করছে, কিন্তু বোঝা যায় না",
    solution: "Checkout, Purchase value বা currency-র ভুল নিজে থেকে ধরে সতর্ক করে",
  },
  {
    icon: BarChart3,
    problem: "Ads Manager-এর এত কলাম, কোনটা দেখব বুঝি না",
    solution: "দরকারি KPI এক জায়গায়, আর AI সহজ বাংলায় বলে দেয় এখন কী করতে হবে",
  },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: BarChart3,
    title: "এক নজরে Dashboard",
    text: "Result, Cost per Result, Reach, Frequency, ROAS। আজ, গতকাল, গত ৭ দিন বা যেকোনো তারিখ, Ads Manager-এর সাথে হুবহু মেলে।",
  },
  {
    icon: Sparkles,
    title: "AI Campaign Report",
    text: "কে কিনছে, কখন কিনছে, video-র কোথায় দর্শক চলে যাচ্ছে, website-এর কোন ধাপে মানুষ হারাচ্ছে, আর সমাধান কী।",
  },
  {
    icon: BellRing,
    title: "Smart Alert",
    text: "খরচ হচ্ছে কিন্তু sale নেই, CPA হঠাৎ বেড়েছে, CTR কমে গেছে, এমন সমস্যা হলেই জানিয়ে দেয়।",
  },
  {
    icon: PieChart,
    title: "Breakdown Insight",
    text: "Placement, region, age, gender, device অনুযায়ী খরচ আর ফলাফল, কোথায় টাকা নষ্ট হচ্ছে স্পষ্ট দেখায়।",
  },
  {
    icon: Eye,
    title: "Video Analysis",
    text: "Hook rate, Hold rate, ThruPlay আর ২৫% থেকে ১০০% পর্যন্ত কতজন দেখেছে, creative কোথায় দুর্বল বোঝা যায়।",
  },
  {
    icon: Clock,
    title: "সঠিক সময়ের হিসাব",
    text: "তোমার Ad Account-এর timezone ধরে দিন গোনা হয়, তাই আজকের সংখ্যা Meta-র সাথে মেলে।",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Users, title: "Account খোলো", text: "ইমেইল দিয়ে এক মিনিটে sign up।" },
  { icon: Link2, title: "Meta connect করো", text: "Facebook দিয়ে login করে Ad Account বেছে নাও।" },
  { icon: Sparkles, title: "AI report নাও", text: "Dashboard আর AI বিশ্লেষণ সাথে সাথে তৈরি।" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "আমার Ad Account কি নিরাপদ?",
    a: "হ্যাঁ। আমরা শুধু তোমার বিজ্ঞাপনের ডাটা পড়ি, কোনো campaign বা budget বদলাই না। Meta-র access token এনক্রিপ্ট করে রাখা হয় এবং যেকোনো সময় এক ক্লিকে সংযোগ বিচ্ছিন্ন করতে পারো।",
  },
  {
    q: "কোন ধরনের campaign সাপোর্ট করে?",
    a: "Sales, Leads, Messages, Traffic, Engagement, Video views সব। প্রতিটি campaign-এর objective অনুযায়ী Result গোনা হয়, Ads Manager যেভাবে দেখায়।",
  },
  {
    q: "Report কি বাংলায় পাব?",
    a: "হ্যাঁ। AI-এর বিশ্লেষণ আর পরামর্শ সহজ বাংলায় আসে। ROAS, CPA-র মতো শব্দগুলো ইংরেজিতে থাকে, যেভাবে আমরা সাধারণত বলি।",
  },
  {
    q: "সংখ্যাগুলো কি Ads Manager-এর সাথে মিলবে?",
    a: "হ্যাঁ। Reach, Frequency, Result সরাসরি Meta থেকে আনা হয়। হিসাব কোড করে, AI শুধু ব্যাখ্যা করে, তাই AI কোনো সংখ্যা বানায় না।",
  },
  {
    q: "একাধিক Ad Account থাকলে?",
    a: "Settings থেকে যেকোনো Ad Account বেছে নিতে পারো। সব account খুঁজে পাওয়া যায় নাম বা ID দিয়ে।",
  },
];

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
        {title}
      </h2>
      {text && <p className="mt-4 text-zinc-600 dark:text-zinc-400">{text}</p>}
    </div>
  );
}

// ড্যাশবোর্ডের মতো দেখতে ছোট নমুনা (আসল স্ক্রিনশট ছাড়াই, তাই সবসময় হালনাগাদ)
function ProductPreview() {
  const kpis = [
    { label: "Result", value: "151", sub: "Purchase", tone: "text-emerald-600" },
    { label: "Cost per Result", value: "$0.96", sub: "↓ 29%", tone: "text-emerald-600" },
    { label: "Reach", value: "50,138", sub: "Frequency 2.36", tone: "text-zinc-400" },
    { label: "CTR (link)", value: "2.04%", sub: "↑ 12%", tone: "text-emerald-600" },
  ];
  const bars = [18, 30, 12, 8, 0, 0, 14, 26, 18, 30, 40, 22, 22, 30, 48, 56, 44, 20, 30, 30, 50, 52, 26, 36];

  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-indigo-500/20 to-violet-500/20 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs text-zinc-400">Hook AI · Dashboard</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
              <p className="text-[11px] text-zinc-500">{k.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{k.value}</p>
              <p className={cn("text-[11px]", k.tone)}>{k.sub}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-3">
          <p className="mb-2 text-[11px] text-zinc-500">দিনের কোন সময়ে sale আসে</p>
          <div className="flex h-16 items-end gap-0.5">
            {bars.map((h, i) => (
              <span
                key={i}
                className={cn("flex-1 rounded-t-sm", i === 15 ? "bg-emerald-500" : "bg-indigo-400")}
                style={{ height: `${(h / 56) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="m-4 mt-2 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 p-3 dark:from-indigo-950/60 dark:to-violet-950/60">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <Sparkles className="size-3.5" aria-hidden /> AI পরামর্শ
          </p>
          <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
            18-24 বয়সে প্রতি Purchase মাত্র $0.69। এই বয়সে budget বাড়াও, রাত ১২-১টায় বিজ্ঞাপন কমাও।
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // লগইন করা থাকলে বোতাম সরাসরি ড্যাশবোর্ডে নেয়
  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? "Dashboard-এ যাও" : "ফ্রি শুরু করো";

  return (
    <div className="bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/80 backdrop-blur dark:border-zinc-900 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Hook AI হোম">
            <Logo />
          </Link>
          <nav aria-label="পেজের অংশ" className="hidden items-center gap-6 text-sm text-zinc-600 md:flex dark:text-zinc-400">
            <a href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-100">Features</a>
            <a href="#how" className="hover:text-zinc-900 dark:hover:text-zinc-100">কীভাবে কাজ করে</a>
            <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100">Pricing</a>
            <a href="#faq" className="hover:text-zinc-900 dark:hover:text-zinc-100">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && (
              <Link href="/login" className={buttonClass("ghost", "hidden sm:inline-flex")}>
                Login
              </Link>
            )}
            <Link href={primaryHref} className={buttonClass("primary")}>
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* হিরো */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-96 max-w-4xl rounded-full bg-gradient-to-r from-indigo-300/40 to-violet-300/40 blur-3xl dark:from-indigo-900/40 dark:to-violet-900/40"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
                <Sparkles className="size-3.5" aria-hidden /> Meta Ads-এর জন্য AI Agent
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
                Facebook Ads-এর টাকা কোথায় নষ্ট হচ্ছে,{" "}
                <span className="text-indigo-600 dark:text-indigo-400">AI বলে দেবে</span>{" "}
                <span className="text-brand-orange">বাংলায়</span>
              </h1>
              <p className="mt-5 text-lg text-zinc-600 dark:text-zinc-400">
                Ad Account connect করো, Hook AI প্রতিটি campaign বিশ্লেষণ করে বলবে কে কিনছে, কখন
                কিনছে, কোথায় খরচ বেশি, আর এখন কী করা উচিত।
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={primaryHref} className={buttonClass("primary", "px-6 py-3 text-base")}>
                  {primaryLabel}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a href="#features" className={buttonClass("secondary", "px-6 py-3 text-base")}>
                  কী কী আছে দেখো
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                {["শুরুতে ফ্রি", "কোনো card লাগবে না", "বিজ্ঞাপনে কোনো পরিবর্তন করে না"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>

        {/* সমস্যা → সমাধান */}
        <section className="border-y border-zinc-100 bg-zinc-50 py-20 dark:border-zinc-900 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle
              eyebrow="সমস্যা চেনা চেনা লাগছে?"
              title="বেশিরভাগ advertiser এই তিনটি সমস্যায় পড়ে"
            />
            <div className="grid gap-6 md:grid-cols-3">
              {PROBLEMS.map(({ icon: Icon, problem, solution }) => (
                <div key={problem} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{problem}</p>
                  <p className="mt-3 flex gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    {solution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ফিচার */}
        <section id="features" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle
              eyebrow="Features"
              title="Ads Manager-এর পুরো ছবি, এক জায়গায়"
              text="সংখ্যা সরাসরি Meta থেকে, হিসাব কোডে, আর ব্যাখ্যা AI-এর। তাই যা দেখবে, তা Ads Manager-এর সাথে মিলবে।"
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-zinc-200 p-6 transition-shadow hover:shadow-md dark:border-zinc-800">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* কীভাবে কাজ করে */}
        <section id="how" className="scroll-mt-20 bg-zinc-50 py-20 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle eyebrow="কীভাবে কাজ করে" title="তিন ধাপে শুরু, পাঁচ মিনিটও লাগবে না" />
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="relative rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="absolute top-6 right-6 text-4xl font-bold text-zinc-100 dark:text-zinc-800">
                    {i + 1}
                  </span>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* নিরাপত্তা */}
        <section className="py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">নিরাপত্তা</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                তোমার Ad Account, তোমার নিয়ন্ত্রণে
              </h2>
              <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                Meta connect করার আগে এই প্রশ্নটাই সবার আগে আসে। তাই নিরাপত্তা আমরা শুরু থেকেই
                গুরুত্ব দিয়ে বানিয়েছি।
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Eye, t: "শুধু পড়ি", d: "Campaign, budget বা বিজ্ঞাপন কখনো বদলাই না।" },
                { icon: Lock, t: "Token এনক্রিপ্টেড", d: "Meta-র access token AES-256 দিয়ে এনক্রিপ্ট করা।" },
                { icon: ShieldCheck, t: "তোমার ডাটা শুধু তোমার", d: "প্রতিটি user শুধু নিজের ডাটা দেখতে পায়।" },
                { icon: Link2, t: "এক ক্লিকে বিচ্ছিন্ন", d: "Disconnect করলে Meta-র অনুমতি আর সব ডাটা মুছে যায়।" },
              ].map(({ icon: Icon, t, d }) => (
                <li key={t} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                  <Icon className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <p className="mt-3 font-semibold text-zinc-900 dark:text-zinc-50">{t}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* দাম */}
        <section id="pricing" className="scroll-mt-20 bg-zinc-50 py-20 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle eyebrow="Pricing" title="শুরুতে পুরোপুরি ফ্রি" text="এখন সব feature ফ্রি ব্যবহার করো। Pro plan শীঘ্রই আসছে।" />
            <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
              <div className="rounded-2xl border-2 border-indigo-600 bg-white p-6 shadow-lg dark:border-indigo-500 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">Free</p>
                <p className="mt-2 text-4xl font-bold text-zinc-900 dark:text-zinc-50">৳0</p>
                <ul className="mt-6 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {["Dashboard ও সব view", "AI summary ও campaign report", "Smart alert", "যেকোনো তারিখের হিসাব"].map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={primaryHref} className={buttonClass("primary", "mt-6 w-full")}>
                  {primaryLabel}
                </Link>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">Pro</p>
                <p className="mt-2 text-4xl font-bold text-zinc-400">শীঘ্রই</p>
                <ul className="mt-6 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {["একাধিক Ad Account একসাথে", "Email ও WhatsApp alert", "Agency-র জন্য client report"].map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionTitle eyebrow="FAQ" title="সাধারণ প্রশ্ন" />
            <div className="flex flex-col gap-3">
              {FAQ.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-2xl border border-zinc-200 px-5 py-4 open:bg-zinc-50 dark:border-zinc-800 dark:open:bg-zinc-900/60"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="text-xl text-zinc-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* শেষ CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-14 text-center text-white sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-violet-400/30 blur-3xl" />
            <LogoMark className="mx-auto size-12 rounded-xl ring-2 ring-white/30" />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              আজই জানো তোমার বিজ্ঞাপনের টাকা কোথায় যাচ্ছে
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-indigo-100">
              Connect করার পাঁচ মিনিটের মধ্যে প্রথম AI report হাতে পাবে।
            </p>
            <Link
              href={primaryHref}
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
            >
              {primaryLabel}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 py-10 dark:border-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} Hook AI · Meta Ads-এর জন্য AI Agent</p>
        </div>
      </footer>
    </div>
  );
}
