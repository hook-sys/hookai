import { graphGetAll, graphRequest } from "./graph";

// বিজ্ঞাপন নিয়ন্ত্রণ: ক্যাম্পেইন, Ad Set ও Ad চালু-বন্ধ আর দৈনিক বাজেট বদল (ads_management লাগে)

export type ManagedLevel = "campaign" | "adset" | "ad";
export type DeliveryStatus = "ACTIVE" | "PAUSED";

export type ManagedAd = { id: string; name: string; status: string; effective_status: string };
export type ManagedAdSet = ManagedAd & {
  campaign_id: string;
  daily_budget: number | null; // মূল মুদ্রায় (যেমন ডলার), সেন্টে নয়
  lifetime_budget: number | null;
  ads: ManagedAd[];
};
export type ManagedCampaign = ManagedAd & {
  objective?: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  adsets: ManagedAdSet[];
};

// Meta বাজেট রাখে মুদ্রার ছোট এককে (সেন্ট, পয়সা)। এই মুদ্রাগুলোতে ছোট একক নেই।
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "PYG", "UGX", "IDR", "COP", "CRC"]);
export const minorFactor = (currency: string | null) => (currency && ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);

const fromMinor = (v: unknown, factor: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / factor : null;
};

// মুছে ফেলা বা আর্কাইভ করা জিনিস দেখানো হয় না
const HIDDEN = new Set(["DELETED", "ARCHIVED"]);
const visible = <T extends { effective_status: string }>(list: T[]) => list.filter((x) => !HIDDEN.has(x.effective_status));

export async function loadAccountStructure(token: string, accountId: string, currency: string | null) {
  const factor = minorFactor(currency);
  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAll<Record<string, string>>(
      `/${accountId}/campaigns`,
      { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget", limit: "200" },
      token,
      10,
    ),
    graphGetAll<Record<string, string>>(
      `/${accountId}/adsets`,
      { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget", limit: "500" },
      token,
      10,
    ),
    graphGetAll<Record<string, string>>(
      `/${accountId}/ads`,
      { fields: "id,name,status,effective_status,adset_id", limit: "500" },
      token,
      10,
    ),
  ]);

  const adsBySet = new Map<string, ManagedAd[]>();
  for (const a of visible(ads as unknown as (ManagedAd & { adset_id: string })[])) {
    const list = adsBySet.get(a.adset_id) ?? [];
    list.push({ id: a.id, name: a.name, status: a.status, effective_status: a.effective_status });
    adsBySet.set(a.adset_id, list);
  }
  const setsByCampaign = new Map<string, ManagedAdSet[]>();
  for (const s of visible(adsets as unknown as (ManagedAd & Record<string, string>)[])) {
    const list = setsByCampaign.get(s.campaign_id) ?? [];
    list.push({
      id: s.id,
      name: s.name,
      status: s.status,
      effective_status: s.effective_status,
      campaign_id: s.campaign_id,
      daily_budget: fromMinor(s.daily_budget, factor),
      lifetime_budget: fromMinor(s.lifetime_budget, factor),
      ads: adsBySet.get(s.id) ?? [],
    });
    setsByCampaign.set(s.campaign_id, list);
  }
  const result: ManagedCampaign[] = visible(campaigns as unknown as (ManagedAd & Record<string, string>)[]).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    effective_status: c.effective_status,
    objective: c.objective,
    daily_budget: fromMinor(c.daily_budget, factor),
    lifetime_budget: fromMinor(c.lifetime_budget, factor),
    adsets: setsByCampaign.get(c.id) ?? [],
  }));
  // চালু থাকা আগে, তারপর নাম অনুযায়ী
  const rank = (s: string) => (s === "ACTIVE" ? 0 : 1);
  return result.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

// একটা জিনিসের এখনকার অবস্থা ও বাজেট (বদলানোর আগে Meta থেকে আবার মিলিয়ে নেওয়ার জন্য)
export async function getObject(token: string, id: string) {
  return graphRequest<{
    id: string;
    name: string;
    status: string;
    daily_budget?: string;
    lifetime_budget?: string;
    account_id?: string;
    campaign?: { account_id?: string };
  }>(`/${id}`, { params: { fields: "id,name,status,daily_budget,lifetime_budget,account_id" }, token });
}

export async function setDeliveryStatus(token: string, id: string, status: DeliveryStatus) {
  return graphRequest<{ success?: boolean }>(`/${id}`, { method: "POST", params: { status }, token });
}

export async function setDailyBudget(token: string, id: string, amountMinor: number) {
  return graphRequest<{ success?: boolean }>(`/${id}`, {
    method: "POST",
    params: { daily_budget: String(Math.round(amountMinor)) },
    token,
  });
}

// টোকেনে বিজ্ঞাপন বদলানোর অনুমতি আছে কিনা
export async function canManageAds(token: string) {
  try {
    const res = await graphRequest<{ data: { permission: string; status: string }[] }>("/me/permissions", { token });
    return res.data.some((p) => p.permission === "ads_management" && p.status === "granted");
  } catch {
    return false;
  }
}
