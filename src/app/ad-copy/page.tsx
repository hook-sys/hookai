import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { listAdCopies } from "@/lib/ai/adCopy";
import { getUserPlan, quotaPeriodLabel, usageCount } from "@/lib/plans";
import AppShell from "@/components/AppShell";
import { Card, PageHeader } from "@/components/ui";
import AdCopyForm from "./AdCopyForm";
import CopyResult from "./CopyResult";

export const metadata = { title: "Ad copy" };

export const maxDuration = 60;

export default async function AdCopyPage() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = await getUserPlan(supabase, user.id);
  const quota = plan.quotas.ad_copy;
  const [used, history] = await Promise.all([
    usageCount(supabase, user.id, "ad_copy", quota.per),
    listAdCopies(supabase, user.id, 10),
  ]);
  const quotaText = tr(
    `${Math.max(quota.count - used, 0)} of ${quota.count} left ${quotaPeriodLabel(quota.per, tr)} · ${plan.name}`,
    `${quotaPeriodLabel(quota.per, tr)} ${quota.count}টির মধ্যে ${Math.max(quota.count - used, 0)}টি বাকি · ${plan.name}`,
  );
  const [latest, ...older] = history;

  return (
    <AppShell active="ad-copy">
      <PageHeader
        title={tr("Ad copy", "অ্যাডের লেখা")}
        description={tr(
          "Primary text, headlines, descriptions and the right button, written for your product.",
          "তোমার পণ্যের জন্য Primary text, Headline, Description আর সঠিক বাটন।",
        )}
      />
      <AdCopyForm latest={latest ?? null} quotaText={quotaText} />

      {older.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">{tr("Earlier sets", "আগের লেখা")}</h2>
          <div className="flex flex-col gap-3">
            {older.map((h) => (
              <Card key={h.id} className="overflow-hidden">
                <details>
                  <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{h.input.product}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {new Date(h.created_at).toLocaleString("en-GB")} · {h.input.objective} · {h.input.language}
                    </p>
                  </summary>
                  <div className="border-t border-zinc-100 px-5 py-5 dark:border-zinc-800">
                    <CopyResult copy={h.content} />
                  </div>
                </details>
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
