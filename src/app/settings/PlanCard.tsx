import type { SupabaseClient } from "@supabase/supabase-js";
import { Gem } from "lucide-react";
import { PLANS, PLAN_IDS, quotaPeriodLabel, usageCount, type Plan, type UsageKind } from "@/lib/plans";
import { SITE } from "@/lib/site";
import type { Tr } from "@/lib/i18n";
import { Badge, Card, CardHeader, cn } from "@/components/ui";

// সেটিংসে বর্তমান প্ল্যান, সীমা আর এই সময়ের ব্যবহার
export default async function PlanCard({
  supabase,
  userId,
  plan,
  tr,
}: {
  supabase: SupabaseClient;
  userId: string;
  plan: Plan;
  tr: Tr;
}) {
  const rows: { kind: UsageKind; label: string }[] = [
    { kind: "summary", label: tr("AI summaries", "AI সারসংক্ষেপ") },
    { kind: "campaign_report", label: tr("Campaign reports", "ক্যাম্পেইন রিপোর্ট") },
    { kind: "ad_copy", label: tr("Ad copy sets", "অ্যাডের লেখা") },
  ];
  const usage = await Promise.all(
    rows.map(async (r) => {
      const q = plan.quotas[r.kind]!;
      return { ...r, quota: q, used: await usageCount(supabase, userId, r.kind, q.per) };
    }),
  );

  return (
    <Card className="mb-6 scroll-mt-6" >
      <div id="plan" />
      <CardHeader
        icon={Gem}
        title={tr("Plan & usage", "প্ল্যান ও ব্যবহার")}
        description={tr(`You're on ${plan.name}`, `তুমি ${plan.name} প্ল্যানে আছ`)}
        action={<Badge tone="brand">{plan.name}</Badge>}
      />
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          {usage.map((u) => {
            const pct = Math.min(100, (u.used / u.quota.count) * 100);
            return (
              <div key={u.kind}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">{u.label}</span>
                  <span className="tabular-nums text-zinc-500">
                    {u.used} / {u.quota.count} {quotaPeriodLabel(u.quota.per, tr)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <dl className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
            <div>
              <dt className="text-xs text-zinc-500">{tr("Campaigns analyzed per account", "প্রতি অ্যাকাউন্টে বিশ্লেষণযোগ্য ক্যাম্পেইন")}</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">{plan.activeCampaigns}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">{tr("Data history", "ডেটার ইতিহাস")}</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {tr(`${plan.historyDays} days`, `${plan.historyDays} দিন`)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{tr("Plans", "প্ল্যানগুলো")}</p>
          <ul className="grid grid-cols-2 gap-2">
            {PLAN_IDS.map((id) => {
              const p = PLANS[id];
              const current = p.id === plan.id;
              return (
                <li
                  key={id}
                  className={cn(
                    "rounded-xl border p-3 text-sm",
                    current
                      ? "border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950"
                      : "border-zinc-200 dark:border-zinc-800",
                  )}
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p>
                  <p className="text-zinc-500">
                    {p.priceBdt === 0 ? "৳0" : `৳${p.priceBdt.toLocaleString("en-US")}${tr("/mo", "/মাস")}`}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            {tr("Online payment is coming soon. To upgrade now, ", "অনলাইন পেমেন্ট শীঘ্রই আসছে। এখনই প্ল্যান বাড়াতে ")}
            {SITE.contactEmail ? (
              <a href={`mailto:${SITE.contactEmail}?subject=Upgrade%20plan`} className="font-medium text-indigo-600 underline dark:text-indigo-400">
                {tr("email us", "আমাদের ইমেইল করো")}
              </a>
            ) : (
              tr("contact us", "যোগাযোগ করো")
            )}
            {tr(".", "।")}
          </p>
        </div>
      </div>
    </Card>
  );
}
