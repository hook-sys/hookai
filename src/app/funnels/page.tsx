import Link from "next/link";
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { getUserPlan } from "@/lib/plans";
import AppShell from "@/components/AppShell";
import { Badge, EmptyState, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Funnel builder" };

// ফানেল বানানো শুধু Pro ও Agency-তে থাকবে এবং AI সীমা থেকে কাটবে। নকশা চূড়ান্ত হলে চালু হবে।
export default async function FunnelsPage() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = await getUserPlan(supabase, user.id);
  const included = plan.quotas.funnel !== null;

  return (
    <AppShell active="funnels">
      <PageHeader
        title={tr("Funnel builder", "ফানেল বিল্ডার")}
        actions={<Badge tone="warning">{tr("Coming soon", "শীঘ্রই আসছে")}</Badge>}
      />
      <EmptyState
        icon={Workflow}
        title={tr("Plan the whole journey, from first view to order", "প্রথম দেখা থেকে অর্ডার পর্যন্ত পুরো পথ সাজাও")}
        text={
          included
            ? tr(
                `This is being built now. It will be part of your ${plan.name} plan and use your monthly AI allowance.`,
                `এটি এখন তৈরি হচ্ছে। তোমার ${plan.name} প্ল্যানে থাকবে, আর মাসিক AI সীমা থেকে কাটবে।`,
              )
            : tr(
                "The funnel builder will be part of the Pro Marketer and Agency plans and will use your monthly AI allowance.",
                "ফানেল বিল্ডার Pro Marketer ও Agency প্ল্যানে থাকবে, আর মাসিক AI সীমা থেকে কাটবে।",
              )
        }
        action={
          included ? undefined : (
            <Link href="/settings#plan" className={buttonClass("secondary")}>
              {tr("See plans", "প্ল্যান দেখো")}
            </Link>
          )
        }
      />
    </AppShell>
  );
}
