import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { PLANS, PLAN_IDS, type PlanId } from "@/lib/plans";
import type { Tr } from "@/lib/i18n";
import { buttonClass, cn } from "@/components/ui";

type Line = { text: string; soon?: boolean };

// ল্যান্ডিং পেজের দাম। সংখ্যাগুলো lib/plans.ts থেকে আসে, তাই দুই জায়গায় আলাদা হয় না।
export default function PricingSection({ tr, ctaHref }: { tr: Tr; ctaHref: string }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const quota = (id: PlanId, kind: "summary" | "campaign_report" | "ad_copy") => {
    const q = PLANS[id].quotas[kind];
    const per = q.per === "day" ? tr("/day", "/দিন") : q.per === "week" ? tr("/week", "/সপ্তাহ") : tr("/mo", "/মাস");
    return `${n(q.count)}${per}`;
  };

  const lines = (id: PlanId): Line[] => {
    const p = PLANS[id];
    const base: Line[] = [
      { text: tr(`${p.adAccounts} ad account${p.adAccounts > 1 ? "s" : ""}`, `${p.adAccounts}টি Ad Account`) },
      { text: tr(`${p.activeCampaigns} active campaigns per account`, `প্রতি অ্যাকাউন্টে ${p.activeCampaigns}টি চালু ক্যাম্পেইন`) },
      { text: tr(`${p.historyDays >= 365 ? `${Math.round(p.historyDays / 365)} year${p.historyDays >= 730 ? "s" : ""}` : `${p.historyDays} days`} of history`,`${p.historyDays >= 365 ? `${Math.round(p.historyDays / 365)} বছরের` : `${p.historyDays} দিনের`} ইতিহাস`) },
      { text: tr(`AI summary ${quota(id, "summary")}`, `AI সারসংক্ষেপ ${quota(id, "summary")}`) },
      { text: tr(`Campaign reports ${quota(id, "campaign_report")}`, `ক্যাম্পেইন রিপোর্ট ${quota(id, "campaign_report")}`) },
      { text: tr(`Ad copy ${quota(id, "ad_copy")}`, `অ্যাডের লেখা ${quota(id, "ad_copy")}`) },
    ];
    const extra: Record<PlanId, Line[]> = {
      free: [{ text: tr("In-app alerts", "অ্যাপের ভেতরে অ্যালার্ট") }],
      solo: [
        { text: tr("Email alerts", "ইমেইল অ্যালার্ট"), soon: true },
        { text: tr("Funnel and creative fatigue", "ফানেল ও ক্রিয়েটিভ ফ্যাটিগ") },
        { text: tr("Launch ads from Hook", "Hook থেকেই অ্যাড চালু"), soon: true },
      ],
      pro: [
        { text: tr("Email and WhatsApp alerts", "ইমেইল ও WhatsApp অ্যালার্ট"), soon: true },
        { text: tr("Audience suggestions", "অডিয়েন্সের পরামর্শ") },
        { text: tr("Funnel builder", "ফানেল বিল্ডার"), soon: true },
        { text: tr("Automated rules", "স্বয়ংক্রিয় নিয়ম"), soon: true },
        { text: tr("3 team members", "৩ জন টিম মেম্বার"), soon: true },
      ],
      agency: [
        { text: tr("Everything in Pro", "Pro-র সবকিছু") },
        { text: tr("Funnel builder", "ফানেল বিল্ডার"), soon: true },
        { text: tr("Branded client reports", "নিজের লোগোসহ ক্লায়েন্ট রিপোর্ট"), soon: true },
        { text: tr("10 team members", "১০ জন টিম মেম্বার"), soon: true },
        { text: tr("WhatsApp support", "WhatsApp সাপোর্ট") },
      ],
    };
    return [...base, ...extra[id]];
  };

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {PLAN_IDS.map((id) => {
        const p = PLANS[id];
        const featured = id === "pro";
        return (
          <div
            key={id}
            className={cn("glass flex flex-col rounded-3xl p-6", featured && "ring-2 ring-indigo-600/60 dark:ring-indigo-300/50")}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{p.name}</p>
              {featured && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
                  {tr("Most popular", "সবচেয়ে জনপ্রিয়")}
                </span>
              )}
            </div>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              ৳{n(p.priceBdt)}
              {p.priceBdt > 0 && <span className="text-base font-normal text-zinc-500">{tr("/mo", "/মাস")}</span>}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {p.priceUsd > 0 ? tr(`or $${p.priceUsd}/mo outside Bangladesh`, `বাংলাদেশের বাইরে $${p.priceUsd}/মাস`) : tr("No card needed", "কার্ড লাগবে না")}
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
              {lines(id).map((l) => (
                <li key={l.text} className={cn("flex gap-2", l.soon ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-700 dark:text-zinc-200")}>
                  {l.soon ? (
                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                  ) : (
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  )}
                  <span>
                    {l.text}
                    {l.soon && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">{tr("(soon)", "(শীঘ্রই)")}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <Link href={ctaHref} className={buttonClass(featured ? "primary" : "secondary", "mt-7 w-full rounded-xl")}>
              {id === "free" ? tr("Start free", "ফ্রি শুরু করো") : tr(`Choose ${p.name}`, `${p.name} নাও`)}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
