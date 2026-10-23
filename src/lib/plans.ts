import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, minAllowedDate } from "@/lib/dates";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/providers";
import { enTr, type Tr } from "@/lib/i18n";

// প্ল্যান ও তাদের সীমা এক জায়গায়। দাম ও সীমা বদলাতে শুধু এখানে বদলাও।

export const PLAN_IDS = ["free", "solo", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type UsageKind = "summary" | "campaign_report" | "ad_copy" | "funnel";

type Quota = { count: number; per: "day" | "week" | "month" };

export type Plan = {
  id: PlanId;
  name: string;
  priceBdt: number;
  priceUsd: number;
  adAccounts: number;
  activeCampaigns: number; // প্রতি Ad Account-এ বিশ্লেষণ করা যায় এমন ক্যাম্পেইন
  historyDays: number;
  teamMembers: number;
  exportReports: boolean; // রিপোর্ট PDF ও CSV হিসেবে নামানো
  quotas: Record<Exclude<UsageKind, "funnel">, Quota> & { funnel: Quota | null };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceBdt: 0,
    priceUsd: 0,
    adAccounts: 1,
    activeCampaigns: 3,
    historyDays: 30,
    teamMembers: 1,
    exportReports: false,
    quotas: {
      summary: { count: 1, per: "week" },
      campaign_report: { count: 3, per: "month" },
      ad_copy: { count: 5, per: "month" },
      funnel: null,
    },
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceBdt: 999,
    priceUsd: 9,
    adAccounts: 3,
    activeCampaigns: 10,
    historyDays: 90,
    teamMembers: 1,
    exportReports: true,
    quotas: {
      summary: { count: 1, per: "day" },
      campaign_report: { count: 30, per: "month" },
      ad_copy: { count: 50, per: "month" },
      funnel: null,
    },
  },
  pro: {
    id: "pro",
    name: "Pro Marketer",
    priceBdt: 2999,
    priceUsd: 29,
    adAccounts: 10,
    activeCampaigns: 25,
    historyDays: 365,
    teamMembers: 3,
    exportReports: true,
    quotas: {
      summary: { count: 5, per: "day" },
      campaign_report: { count: 150, per: "month" },
      ad_copy: { count: 300, per: "month" },
      funnel: { count: 20, per: "month" },
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceBdt: 9999,
    priceUsd: 99,
    adAccounts: 40,
    activeCampaigns: 50,
    historyDays: 1095,
    teamMembers: 10,
    exportReports: true,
    quotas: {
      summary: { count: 20, per: "day" },
      campaign_report: { count: 600, per: "month" },
      ad_copy: { count: 1500, per: "month" },
      funnel: { count: 100, per: "month" },
    },
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return PLAN_IDS.includes(value as PlanId);
}

// সুপার অ্যাডমিন সবকিছু পরীক্ষা করতে পারে, তাই সবচেয়ে বড় প্ল্যান পায়
export async function getUserPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  if (await isCurrentUserAdmin(supabase)) return PLANS.agency;
  const { data } = await supabase.from("user_plans").select("plan").eq("user_id", userId).maybeSingle();
  return PLANS[isPlanId(data?.plan) ? data.plan : "free"];
}

// প্ল্যান অনুযায়ী সবচেয়ে পুরনো যে তারিখ দেখা যাবে (Meta-র ৩৭ মাসের সীমাও মানে)
export function planMinDate(plan: Plan, today: string) {
  const byPlan = addDays(today, -(plan.historyDays - 1));
  const byMeta = minAllowedDate(today);
  return byPlan > byMeta ? byPlan : byMeta;
}

function windowStart(per: Quota["per"]) {
  const now = new Date();
  if (per === "day") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (per === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // মাস: চলতি ক্যালেন্ডার মাসের শুরু (UTC)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function usageCount(supabase: SupabaseClient, userId: string, kind: UsageKind, per: Quota["per"]) {
  const { count } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStart(per).toISOString());
  return count ?? 0;
}

export function quotaPeriodLabel(per: Quota["per"], tr: Tr = enTr) {
  return per === "day" ? tr("per day", "প্রতিদিন") : per === "week" ? tr("per week", "প্রতি সপ্তাহে") : tr("per month", "প্রতি মাসে");
}

const KIND_NAMES: Record<UsageKind, [string, string]> = {
  summary: ["AI summaries", "AI সারসংক্ষেপ"],
  campaign_report: ["campaign reports", "ক্যাম্পেইন রিপোর্ট"],
  ad_copy: ["ad copy sets", "অ্যাডের লেখা"],
  funnel: ["funnels", "ফানেল"],
};

// সীমা শেষ হলে ব্যবহারকারীকে দেখানোর মতো ত্রুটি দেয়; AI ডাকার আগে ব্যবহার করো
export async function assertQuota(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
  kind: UsageKind,
  tr: Tr = enTr,
) {
  const quota = plan.quotas[kind];
  const name = tr(KIND_NAMES[kind][0], KIND_NAMES[kind][1]);
  if (!quota) {
    throw new AiError(
      tr(`${name} aren't included in the ${plan.name} plan.`, `${plan.name} প্ল্যানে ${name} নেই।`),
    );
  }
  const used = await usageCount(supabase, userId, kind, quota.per);
  if (used >= quota.count) {
    throw new AiError(
      tr(
        `You've used all ${quota.count} ${name} ${quotaPeriodLabel(quota.per, tr)} on the ${plan.name} plan. Upgrade for more.`,
        `${plan.name} প্ল্যানে ${quotaPeriodLabel(quota.per, tr)} ${quota.count}টি ${name} শেষ। আরও লাগলে প্ল্যান বাড়াও।`,
      ),
    );
  }
}

export async function recordUsage(supabase: SupabaseClient, userId: string, kind: UsageKind) {
  const { error } = await supabase.from("ai_usage").insert({ user_id: userId, kind });
  if (error) console.error("usage record failed", error.message);
}
