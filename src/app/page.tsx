import type { ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  ChartNoAxesColumn,
  Crosshair,
  MousePointerClick,
  PackageCheck,
  Repeat2,
  ShoppingCart,
  Target,
  Truck,
} from "lucide-react";
import { LogoMark, cn } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";
import { CASES, TOTALS, WHATSAPP_DISPLAY, type CaseResult } from "@/components/landing/results";
import { WhatsAppButton, WhatsAppIcon } from "@/components/landing/WhatsApp";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";

// Hook-এর সার্ভিস পেজ: Meta বিজ্ঞাপনে পুরো সেলস ফানেল আমরা চালাই। আসল ফলাফল দেখিয়ে
// অনলাইন ব্যবসার মালিককে WhatsApp-এ কথা বলতে আনা। সাদা কাচের মতো, কোনো গ্রেডিয়েন্ট নেই।

export const metadata = {
  title: "Hook — Meta ads that bring orders",
  description:
    "Hook runs your full Meta sales funnel: content, ads, advanced retargeting and order tracking to delivery. 2,524 website orders for our clients in the last 30 days.",
};

// মাউস নিলে দেয়াল থেকে একটু উপরে উঠে আসে (ছায়া বড় হয়)
const LIFT =
  "transition-[translate,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-1.5 hover:shadow-[0_28px_56px_-24px_rgb(15_23_42/0.32)]";

function Glass({ children, className, lift = true }: { children: ReactNode; className?: string; lift?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-zinc-900/[0.07] bg-white/80 shadow-[inset_0_1px_0_white,0_14px_36px_-24px_rgb(15_23_42/0.25)] backdrop-blur-xl",
        lift && LIFT,
        className,
      )}
    >
      {children}
    </div>
  );
}


function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-3xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-4xl", className)}>{children}</h2>;
}

// প্রতিটি অংশের বড় শিরোনাম, মাঝখানে
function SectionTitle({ title, sub, text }: { title: string; sub: string; text?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-4xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-5xl">{title}</h2>
      <p className="mt-3 text-xl font-medium text-zinc-700 sm:text-2xl">{sub}</p>
      {text && <p className="mt-3 text-zinc-600">{text}</p>}
    </div>
  );
}

// দৈনিক অর্ডারের ছোট বার চার্ট (Hook ড্যাশবোর্ডের মতো)
function OrdersChart({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values);
  const w = 300;
  const h = 84;
  const gap = 2;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-24 w-full" preserveAspectRatio="none">
      {values.map((v, i) => {
        const bh = Math.max(2, (v / max) * (h - 4));
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={1.5} fill="#3157B0" opacity={i === values.length - 1 ? 1 : 0.78} />;
      })}
    </svg>
  );
}

function ResultShot({ c, tr, n, money }: { c: CaseResult; tr: (en: string, bn: string) => string; n: (v: number) => string; money: (v: number) => string }) {
  const kpis = [
    { k: tr("Website orders", "ওয়েবসাইট অর্ডার"), v: n(c.orders), strong: true },
    { k: tr("Cost per order", "প্রতি অর্ডারে খরচ"), v: money(c.spendUsd / c.orders), strong: true },
    { k: tr("Ad spend", "বিজ্ঞাপন খরচ"), v: money(c.spendUsd) },
    { k: tr("Add to cart", "কার্টে যোগ"), v: n(c.addToCart) },
    { k: tr("Link clicks", "লিংক ক্লিক"), v: n(c.clicks) },
    { k: tr("Inbox conversations", "ইনবক্স মেসেজ"), v: n(c.messages) },
  ];
  return (
    <Glass className="overflow-hidden">
      {/* ড্যাশবোর্ড স্ক্রিনশটের মতো উপরের বার */}
      <div className="flex items-center gap-2 border-b border-zinc-900/[0.06] bg-white/50 px-5 py-3">
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-900/10">{c.store}</span>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map((x) => (
            <div key={x.k} className={cn("rounded-2xl border border-zinc-900/[0.06] bg-white px-4 py-3 shadow-sm", LIFT)}>
              <p className="text-xs text-zinc-500">{x.k}</p>
              <p className={cn("mt-1 font-semibold tracking-tight text-zinc-950 tabular-nums", x.strong ? "text-2xl" : "text-lg")}>{x.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-zinc-900/[0.06] bg-white px-4 pt-3 pb-2 shadow-sm">
          <p className="text-xs font-medium text-zinc-600">{tr("Orders per day", "প্রতিদিনের অর্ডার")}</p>
          <OrdersChart values={c.dailyOrders} label={tr(`Daily orders for the ${c.label.en}`, `${c.label.bn}-এর প্রতিদিনের অর্ডার`)} />
        </div>
      </div>
    </Glass>
  );
}

export default async function LandingPage() {
  const locale = await getLocale();
  const tr = makeTr(locale);
  const fmt = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US");
  const n = (v: number) => fmt.format(Math.round(v));
  // ডলারের চিহ্ন আগে, সংখ্যা ভাষা অনুযায়ী
  const money = (v: number) =>
    "$" + new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { maximumFractionDigits: v < 10 ? 2 : 0, minimumFractionDigits: v < 10 ? 2 : 0 }).format(v);
  const msg = tr("Hi Hook, I want more orders from Meta ads for my business.", "হ্যালো Hook, আমার ব্যবসার জন্য Meta বিজ্ঞাপনে আরও অর্ডার চাই।");
  const cta = tr("Talk on WhatsApp", "WhatsApp-এ কথা বলুন");

  const funnel = [
    {
      i: Camera,
      stage: tr("1 · Attention", "১ · নজর কাড়া"),
      t: tr("Content that stops the scroll", "স্ক্রল থামানো কনটেন্ট"),
      d: tr(
        "Video and image ideas with a strong first 3 seconds, made for your product and your buyer.",
        "প্রথম ৩ সেকেন্ডেই আটকে রাখা ভিডিও আর ছবি, আপনার পণ্য আর ক্রেতার কথা ভেবে।",
      ),
    },
    {
      i: Target,
      stage: tr("2 · Right buyers", "২ · সঠিক ক্রেতা"),
      t: tr("Sales campaigns on the right audience", "সঠিক অডিয়েন্সে সেলস ক্যাম্পেইন"),
      d: tr(
        "Campaigns optimised for purchases, tested by age, area and creative, budget moved to what sells.",
        "Purchase-এর জন্য সাজানো ক্যাম্পেইন; বয়স, এলাকা আর ক্রিয়েটিভ টেস্ট করে যেটা বিক্রি আনে সেখানে বাজেট।",
      ),
    },
    {
      i: Repeat2,
      stage: tr("3 · Bring them back", "৩ · ফিরিয়ে আনা"),
      t: tr("Advanced retargeting", "অ্যাডভান্সড রিটার্গেটিং"),
      d: tr(
        "Visitors, add-to-carts, video viewers and inbox chats see the right next ad until they order.",
        "যারা সাইট দেখেছে, কার্টে রেখেছে, ভিডিও দেখেছে বা মেসেজ দিয়েছে, অর্ডার না করা পর্যন্ত তাদের পরের ধাপের বিজ্ঞাপন।",
      ),
    },
    {
      i: Truck,
      stage: tr("4 · Delivered", "৪ · ডেলিভারি পর্যন্ত"),
      t: tr("Orders tracked to delivery", "ডেলিভারি পর্যন্ত অর্ডার ট্র্যাক"),
      d: tr(
        "We match every order to its campaign and follow it through confirm, courier and delivery, so we scale what really pays.",
        "প্রতিটি অর্ডার কোন ক্যাম্পেইনের তা মিলিয়ে কনফার্ম, কুরিয়ার আর ডেলিভারি পর্যন্ত দেখি, তাই যেটা সত্যি লাভ আনে সেটাই বাড়াই।",
      ),
    },
  ];

  const services = [
    { i: Camera, t: tr("Ad content plan", "বিজ্ঞাপনের কনটেন্ট প্ল্যান"), d: tr("Hooks, scripts and creative tests every week.", "প্রতি সপ্তাহে নতুন হুক, স্ক্রিপ্ট আর ক্রিয়েটিভ টেস্ট।") },
    { i: Crosshair, t: tr("Pixel and tracking setup", "Pixel আর ট্র্যাকিং সেটআপ"), d: tr("Purchase, add to cart and checkout tracked correctly.", "Purchase, Add to cart, Checkout ঠিকভাবে ট্র্যাক।") },
    { i: Repeat2, t: tr("Retargeting funnels", "রিটার্গেটিং ফানেল"), d: tr("Separate audiences for every step of the buying journey.", "কেনার প্রতিটি ধাপের জন্য আলাদা অডিয়েন্স।") },
    { i: ChartNoAxesColumn, t: tr("Daily optimisation", "প্রতিদিন অপটিমাইজেশন"), d: tr("Losing ads off, winners scaled step by step.", "লস করা বিজ্ঞাপন বন্ধ, ভালোগুলো ধাপে ধাপে বাড়ানো।") },
    { i: PackageCheck, t: tr("Order and courier view", "অর্ডার আর কুরিয়ার হিসাব"), d: tr("Confirmed, cancelled, in courier and delivered per campaign.", "প্রতিটি ক্যাম্পেইনের কনফার্ম, ক্যানসেল, কুরিয়ার আর ডেলিভারি।") },
    { i: BadgeCheck, t: tr("Clear reports", "পরিষ্কার রিপোর্ট"), d: tr("What we spent, what came back, what we do next.", "কত খরচ, কত এল, এরপর কী করব।") },
  ];

  const steps = [
    { t: tr("Message us on WhatsApp", "WhatsApp-এ মেসেজ দিন"), d: tr("Tell us your product, website and current results.", "আপনার পণ্য, ওয়েবসাইট আর এখনকার ফলাফল জানান।") },
    { t: tr("Free account check", "ফ্রি অ্যাকাউন্ট চেক"), d: tr("We look at your ads, pixel and funnel and show where orders are lost.", "আপনার বিজ্ঞাপন, Pixel আর ফানেল দেখে বলি কোথায় অর্ডার হারাচ্ছে।") },
    { t: tr("Plan and launch", "প্ল্যান আর লঞ্চ"), d: tr("Content, campaigns and retargeting set up for your goal.", "আপনার লক্ষ্য অনুযায়ী কনটেন্ট, ক্যাম্পেইন আর রিটার্গেটিং সাজানো।") },
    { t: tr("Scale what works", "যেটা কাজ করে, সেটা বাড়ানো"), d: tr("Weekly review with real orders, not just clicks.", "শুধু ক্লিক নয়, আসল অর্ডার দেখে প্রতি সপ্তাহে রিভিউ।") },
  ];

  const faq = [
    {
      q: tr("Who is Hook for?", "Hook কাদের জন্য?"),
      a: tr(
        "Online businesses in Bangladesh that sell through a website (Shopify, WooCommerce or custom) or a Facebook page and want more paying orders from Meta ads.",
        "বাংলাদেশের অনলাইন ব্যবসা, যারা ওয়েবসাইট (Shopify, WooCommerce বা নিজস্ব) বা Facebook পেজ দিয়ে বিক্রি করেন এবং Meta বিজ্ঞাপন থেকে আরও অর্ডার চান।",
      ),
    },
    {
      q: tr("Where do these results come from?", "এই ফলাফল কোথা থেকে?"),
      a: tr(
        "From two of our current clients over the last 30 days. Ad numbers are from Meta Ads Manager and orders are from their own websites. We hide brand names for privacy.",
        "আমাদের দুইজন বর্তমান ক্লায়েন্টের গত ৩০ দিনের হিসাব। বিজ্ঞাপনের সংখ্যা Meta Ads Manager থেকে, অর্ডার তাদের নিজের ওয়েবসাইট থেকে। গোপনীয়তার জন্য ব্র্যান্ডের নাম দেখাইনি।",
      ),
    },
    {
      q: tr("Do you make the ad content too?", "বিজ্ঞাপনের কনটেন্টও কি আপনারা বানান?"),
      a: tr(
        "Yes. We plan the hooks, scripts and creative tests. Content is what makes the funnel work, so we treat it as part of the job.",
        "হ্যাঁ। হুক, স্ক্রিপ্ট আর ক্রিয়েটিভ টেস্ট আমরা প্ল্যান করি। ফানেল কাজ করে কনটেন্টের জোরে, তাই এটা আমাদের কাজেরই অংশ।",
      ),
    },
    {
      q: tr("How do I know which ads bring real orders?", "কোন বিজ্ঞাপন আসল অর্ডার আনছে, বুঝব কীভাবে?"),
      a: tr(
        "We connect your website and courier, so every order is matched to its campaign and followed until delivery. You see orders, cancels and deliveries per campaign.",
        "আপনার ওয়েবসাইট আর কুরিয়ার যুক্ত করি, তাই প্রতিটি অর্ডার তার ক্যাম্পেইনের সাথে মেলে আর ডেলিভারি পর্যন্ত দেখা যায়। প্রতিটি ক্যাম্পেইনের অর্ডার, ক্যানসেল আর ডেলিভারি আপনি দেখবেন।",
      ),
    },
    {
      q: tr("What does it cost?", "খরচ কত?"),
      a: tr(
        "It depends on your products, budget and how much content you need. Message us on WhatsApp and we'll suggest a plan after a free check.",
        "আপনার পণ্য, বাজেট আর কতটা কনটেন্ট লাগবে তার উপর নির্ভর করে। WhatsApp-এ মেসেজ দিন, ফ্রি চেকের পর আমরা প্ল্যান জানাব।",
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-zinc-900 [color-scheme:light]">

      <header className="sticky top-0 z-30 border-b border-zinc-900/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label={tr("Hook home", "Hook হোম")}>
            {/* ডার্ক মোডেও পেজ সাদা থাকে, তাই লোগোর লেখা নিজে রং ঠিক করে */}
            <span className="flex items-center gap-2.5">
              <LogoMark className="size-9 shadow-sm" />
              <span className="text-sm font-bold tracking-wide text-[#3157B0]">
                HOOK <span className="text-[#FF5A2C]">AI</span>
              </span>
            </span>
          </Link>
          <nav aria-label={tr("Main menu", "প্রধান মেনু")} className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
            <a href="#results" className="hover:text-zinc-950">{tr("Results", "ফলাফল")}</a>
            <a href="#funnel" className="hover:text-zinc-950">{tr("How we work", "কীভাবে কাজ করি")}</a>
            <a href="#services" className="hover:text-zinc-950">{tr("Services", "সার্ভিস")}</a>
            <a href="#faq" className="hover:text-zinc-950">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch className="dark:border-zinc-900/10 dark:bg-white/60 [&_button[aria-pressed=false]]:!text-zinc-600 [&_button[aria-pressed=true]]:!bg-zinc-900 [&_button[aria-pressed=true]]:!text-white" />
            <WhatsAppButton message={msg} size="sm">
              {tr("Contact us", "যোগাযোগ")}
            </WhatsAppButton>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-zinc-950 sm:text-5xl lg:text-[3.4rem]">
              {tr("Stop paying for likes. Get orders from Meta ads.", "লাইক নয়, Meta বিজ্ঞাপন থেকে অর্ডার আনুন।")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
              {tr(
                "Hook runs your full sales funnel on Facebook and Instagram: scroll-stopping content, sales campaigns, advanced retargeting, and every order tracked until it's delivered.",
                "Hook আপনার Facebook আর Instagram-এর পুরো সেলস ফানেল চালায়: স্ক্রল থামানো কনটেন্ট, সেলস ক্যাম্পেইন, অ্যাডভান্সড রিটার্গেটিং, আর প্রতিটি অর্ডার ডেলিভারি পর্যন্ত ট্র্যাক।",
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <WhatsAppButton message={msg}>{cta}</WhatsAppButton>
              <a href="#results" className={cn("inline-flex items-center rounded-xl border border-zinc-900/10 bg-white px-5 py-3.5 text-base font-semibold text-zinc-800 shadow-sm", LIFT)}>
                {tr("See results", "ফলাফল দেখুন")}
              </a>
            </div>
          </div>

          <Glass className="p-6 sm:p-7">
            <div className="grid grid-cols-2 gap-3">
              {[
                { i: ShoppingCart, k: tr("Website orders", "ওয়েবসাইট অর্ডার"), v: n(TOTALS.orders) },
                { i: Target, k: tr("Avg. cost per order", "গড়ে প্রতি অর্ডারে খরচ"), v: money(TOTALS.spendUsd / TOTALS.orders) },
                { i: MousePointerClick, k: tr("Ad impressions", "বার বিজ্ঞাপন দেখানো"), v: n(TOTALS.impressions) },
                { i: WhatsAppIcon, k: tr("Inbox conversations", "ইনবক্স মেসেজ"), v: n(TOTALS.messages) },
              ].map((x) => (
                <div key={x.k} className={cn("rounded-2xl border border-zinc-900/[0.06] bg-white p-4 shadow-sm", LIFT)}>
                  <x.i className="size-4 text-[#3157B0]" />
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">{x.v}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{x.k}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-zinc-900/[0.06] bg-white px-4 pt-3 pb-1 shadow-sm">
              <p className="text-xs font-medium text-zinc-600">{tr("Orders per day, both clients", "প্রতিদিনের অর্ডার, দুই ক্লায়েন্ট মিলে")}</p>
              <OrdersChart
                values={CASES[0].dailyOrders.map((v, i) => v + (CASES[1].dailyOrders[i] ?? 0))}
                label={tr("Daily orders for both clients", "দুই ক্লায়েন্টের প্রতিদিনের অর্ডার")}
              />
            </div>
          </Glass>
        </section>

        {/* Results */}
        <section id="results" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle
              title={tr("Real results", "আসল ফলাফল")}
              sub={tr("What our clients got in the last 30 days", "গত ৩০ দিনে আমাদের ক্লায়েন্টরা যা পেয়েছে")}
              text={tr(
                "Ad numbers from Meta Ads Manager, orders from each client's own website. Brand names hidden for privacy.",
                "বিজ্ঞাপনের হিসাব Meta Ads Manager থেকে, অর্ডার ক্লায়েন্টের নিজের ওয়েবসাইট থেকে। গোপনীয়তার জন্য ব্র্যান্ডের নাম দেখানো হয়নি।",
              )}
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              {CASES.map((c) => (
                <ResultShot key={c.id} c={c} tr={tr} n={n} money={money} />
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <WhatsAppButton message={msg}>{tr("I want results like this", "আমিও এমন ফলাফল চাই")}</WhatsAppButton>
              <p className="text-sm text-zinc-500">{tr("Results differ by product and budget; we'll tell you honestly what to expect.", "পণ্য আর বাজেট অনুযায়ী ফলাফল আলাদা হয়; কী আশা করা যায়, সৎভাবে জানাব।")}</p>
            </div>
          </div>
        </section>

        {/* Funnel */}
        <section id="funnel" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionTitle
            title={tr("Full sales funnel", "পুরো সেলস ফানেল")}
            sub={tr("One ad rarely sells. A funnel does.", "একটা বিজ্ঞাপনে বিক্রি কম হয়। ফানেলে হয়।")}
            text={tr(
              "Most buyers need to see you a few times before they order. We plan every step, from the first video to the delivered parcel.",
              "বেশিরভাগ ক্রেতা অর্ডারের আগে কয়েকবার আপনাকে দেখে। প্রথম ভিডিও থেকে ডেলিভারি হওয়া পার্সেল পর্যন্ত প্রতিটি ধাপ আমরা সাজাই।",
            )}
          />
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {funnel.map((f) => (
              <li key={f.t}>
                <Glass className="h-full p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-white bg-white shadow-sm">
                    <f.i className="size-5 text-[#3157B0]" aria-hidden />
                  </span>
                  <p className="mt-4 text-xs font-semibold tracking-wide text-zinc-500">{f.stage}</p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-950">{f.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.d}</p>
                </Glass>
              </li>
            ))}
          </ol>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle
              title={tr("What we do for you", "আমরা যা করি")}
              sub={tr("Result-driven, not report-driven.", "রিপোর্ট নয়, ফলাফলের জন্য কাজ।")}
              text={tr(
                "We judge every taka by the orders it brings back. If an ad doesn't sell, it's off. If it sells, we scale it carefully.",
                "প্রতিটি টাকা কত অর্ডার আনল, সেটা দিয়েই বিচার। বিজ্ঞাপন বিক্রি না আনলে বন্ধ, আনলে সাবধানে বাড়ানো।",
              )}
            />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <li key={s.t}>
                  <Glass className="flex h-full gap-4 p-5">
                    <s.i className="mt-0.5 size-5 shrink-0 text-[#3157B0]" aria-hidden />
                    <div>
                      <h3 className="font-semibold text-zinc-950">{s.t}</h3>
                      <p className="mt-1 text-sm text-zinc-600">{s.d}</p>
                    </div>
                  </Glass>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex justify-center">
              <WhatsAppButton message={msg}>{cta}</WhatsAppButton>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionTitle
            title={tr("Getting started", "শুরু করা সহজ")}
            sub={tr("Four steps to your first orders", "প্রথম অর্ডার পর্যন্ত চারটি ধাপ")}
          />
          <ol className="mt-12 grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t}>
                <Glass className="h-full p-6">
                  <span className="text-sm font-semibold text-[#3157B0] tabular-nums">{n(i + 1).padStart(2, n(0))}</span>
                  <h3 className="mt-2 font-semibold text-zinc-950">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-zinc-600">{s.d}</p>
                </Glass>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <H2 className="text-center sm:text-5xl">{tr("Questions", "প্রশ্ন ও উত্তর")}</H2>
          <div className="mt-8 flex flex-col gap-3">
            {faq.map((f) => (
              <details key={f.q} className={cn("group rounded-2xl border border-zinc-900/[0.07] bg-white px-5 py-4 shadow-sm", LIFT)}>
                <summary className="cursor-pointer list-none font-semibold text-zinc-950 marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-zinc-400 transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <Glass className="flex flex-col items-center px-6 py-14 text-center">
            <H2 className="max-w-2xl">{tr("Want more orders next month?", "আগামী মাসে আরও অর্ডার চান?")}</H2>
            <p className="mt-3 max-w-xl text-zinc-600">
              {tr(
                "Send us a message. We'll check your ads and tell you where the orders are being lost, free.",
                "একটা মেসেজ দিন। আপনার বিজ্ঞাপন দেখে কোথায় অর্ডার হারাচ্ছে, ফ্রিতে জানাব।",
              )}
            </p>
            <WhatsAppButton message={msg} className="mt-7">
              {tr(`WhatsApp ${WHATSAPP_DISPLAY}`, `WhatsApp ${WHATSAPP_DISPLAY}`)}
            </WhatsAppButton>
          </Glass>
        </section>
      </main>

      <footer className="relative border-t border-zinc-900/[0.06] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-500 sm:px-6">
          <span>© {new Date().getFullYear()} Hook · hook.com.bd</span>
          <nav aria-label={tr("Legal", "আইনি")} className="flex flex-wrap gap-5">
            <Link href="/blog" className="hover:text-zinc-900">{tr("Blog", "ব্লগ")}</Link>
            <Link href="/privacy" className="hover:text-zinc-900">{tr("Privacy", "প্রাইভেসি")}</Link>
            <Link href="/terms" className="hover:text-zinc-900">{tr("Terms", "শর্তাবলি")}</Link>
          </nav>
        </div>
      </footer>

      {/* মোবাইলে সবসময় হাতের কাছে WhatsApp */}
      <WhatsAppButton message={msg} size="sm" className="fixed right-4 bottom-4 z-40 rounded-full px-4 py-3 sm:hidden">
        WhatsApp
      </WhatsAppButton>
    </div>
  );
}
