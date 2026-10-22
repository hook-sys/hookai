import type { MetaAction } from "@/lib/meta/graph";

// Meta একই কনভার্শন একাধিক action_type-এ দেখায় (যেমন omni_purchase ও purchase)।
// দ্বিগুণ গোনা এড়াতে অগ্রাধিকার অনুযায়ী প্রথম যেটি পাওয়া যায় সেটিই নেওয়া হয়।
const PURCHASE_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];
const LEAD_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
];

export function pickAction(list: MetaAction[] | undefined, types: string[]) {
  if (!list) return 0;
  for (const type of types) {
    const found = list.find((a) => a.action_type === type);
    if (found) return Number(found.value) || 0;
  }
  return 0;
}

export const pickPurchases = (list?: MetaAction[]) =>
  pickAction(list, PURCHASE_TYPES);
export const pickPurchaseValue = (list?: MetaAction[]) =>
  pickAction(list, PURCHASE_TYPES);
export const pickLeads = (list?: MetaAction[]) => pickAction(list, LEAD_TYPES);

// যোগ করা যায় এমন কাঁচা সংখ্যা
export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
};

export const emptyTotals = (): Totals => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  purchaseValue: 0,
  leads: 0,
});

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    purchases: a.purchases + b.purchases,
    purchaseValue: a.purchaseValue + b.purchaseValue,
    leads: a.leads + b.leads,
  };
}

// ভাগফল; হর শূন্য হলে null (UI-তে "—" দেখায়), যাতে ভুল সংখ্যা না আসে
const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

// যোগফল থেকে হিসাব। দৈনিক অনুপাতের গড় না নিয়ে মোট সংখ্যা থেকে হিসাব হয়।
export function deriveMetrics(t: Totals) {
  return {
    ctr: ratio(t.clicks * 100, t.impressions), // %
    cpc: ratio(t.spend, t.clicks),
    cpm: ratio(t.spend * 1000, t.impressions),
    costPerPurchase: ratio(t.spend, t.purchases),
    costPerLead: ratio(t.spend, t.leads),
    roas: ratio(t.purchaseValue, t.spend),
  };
}

export type DerivedMetrics = ReturnType<typeof deriveMetrics>;
