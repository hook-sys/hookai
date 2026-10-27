// স্বয়ংক্রিয় নিয়মের ধরন, লেবেল আর তৈরি-করা নমুনা (টেমপ্লেট)

export const RULE_METRICS = [
  "cost_per_result",
  "cost_per_purchase",
  "cost_per_order",
  "results",
  "roas",
  "ctr",
  "delivery_rate",
  "spend",
] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];

export const RULE_WINDOWS = ["today", "last_3d", "last_7d"] as const;
export type RuleWindow = (typeof RULE_WINDOWS)[number];

export const RULE_ACTIONS = ["pause", "increase_budget", "decrease_budget", "notify"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export type RuleLevel = "campaign" | "adset";
export type RuleOperator = "gt" | "lt";

export type AdRule = {
  id: string;
  user_id: string;
  ad_account_id: string;
  name: string;
  enabled: boolean;
  level: RuleLevel;
  object_ids: string[];
  metric: RuleMetric;
  time_window: RuleWindow;
  operator: RuleOperator;
  threshold: number;
  min_spend: number;
  min_results: number;
  action: RuleAction;
  action_value: number | null;
  max_budget: number | null;
  cooldown_hours: number;
  last_run_at?: string | null;
};

type Tr = (en: string, bn: string) => string;

// টাকার অঙ্ক নাকি শতাংশ/সংখ্যা, তা দিয়ে ইনপুটের পাশে মুদ্রা দেখানো হয়
export const MONEY_METRICS = new Set<RuleMetric>(["cost_per_result", "cost_per_purchase", "cost_per_order", "spend"]);

// অর্ডার থেকে হিসাব শুধু ক্যাম্পেইন লেভেলে হয় (অর্ডারে ক্যাম্পেইনের ID থাকে, Ad Set-এর নয়)
export const CAMPAIGN_ONLY_METRICS = new Set<RuleMetric>(["cost_per_order", "delivery_rate"]);

export function metricLabel(m: RuleMetric, tr: Tr) {
  const map: Record<RuleMetric, [string, string]> = {
    cost_per_result: ["Cost per result (Meta)", "প্রতি রেজাল্টে খরচ (Meta)"],
    cost_per_purchase: ["Cost per purchase (pixel)", "প্রতি পারচেজে খরচ (Pixel)"],
    cost_per_order: ["Cost per order (Hook orders)", "প্রতি অর্ডারে খরচ (Hook-এর অর্ডার)"],
    results: ["Results", "রেজাল্ট সংখ্যা"],
    roas: ["ROAS (purchase value ÷ spend)", "ROAS (বিক্রি ÷ খরচ)"],
    ctr: ["Link CTR %", "লিংক CTR %"],
    delivery_rate: ["Delivery rate % (orders)", "ডেলিভারি রেট % (অর্ডার)"],
    spend: ["Spend", "খরচ"],
  };
  return tr(...map[m]);
}

export function windowLabel(w: RuleWindow, tr: Tr) {
  const map: Record<RuleWindow, [string, string]> = {
    today: ["Today", "আজ"],
    last_3d: ["Last 3 days (incl. today)", "গত ৩ দিন (আজসহ)"],
    last_7d: ["Last 7 days (incl. today)", "গত ৭ দিন (আজসহ)"],
  };
  return tr(...map[w]);
}

export function actionLabel(a: RuleAction, value: number | null, tr: Tr) {
  if (a === "pause") return tr("Turn off", "বন্ধ করো");
  if (a === "notify") return tr("Only alert me", "শুধু জানাও");
  if (a === "increase_budget") return tr(`Raise daily budget ${value ?? 0}%`, `দৈনিক বাজেট ${value ?? 0}% বাড়াও`);
  return tr(`Cut daily budget ${value ?? 0}%`, `দৈনিক বাজেট ${value ?? 0}% কমাও`);
}

export type RuleTemplate = {
  id: string;
  title: [string, string];
  hint: [string, string];
  rule: Omit<AdRule, "id" | "user_id" | "ad_account_id" | "enabled" | "object_ids" | "name">;
};

// টার্গেট খরচ (যেমন প্রতি অর্ডারে $1.5) থেকে টেমপ্লেটের সংখ্যা বসে; ফর্মে বদলানো যায়
export function ruleTemplates(target: number): RuleTemplate[] {
  const t = Math.max(0.01, target);
  const r = (v: number) => Math.round(v * 100) / 100;
  return [
    {
      id: "stop_expensive",
      title: ["Turn off expensive ad sets", "খরচ বেশি হলে Ad Set বন্ধ"],
      hint: ["Today's cost per result is more than double the target, after enough spend.", "আজ প্রতি রেজাল্টে খরচ টার্গেটের দ্বিগুণের বেশি হলে (যথেষ্ট খরচের পর)।"],
      rule: { level: "adset", metric: "cost_per_result", time_window: "today", operator: "gt", threshold: r(t * 2), min_spend: r(t * 2), min_results: 0, action: "pause", action_value: null, max_budget: null, cooldown_hours: 24 },
    },
    {
      id: "stop_no_results",
      title: ["Turn off when spending with no results", "খরচ হচ্ছে কিন্তু রেজাল্ট নেই, তাই বন্ধ"],
      hint: ["Spent 3× the target today and still zero results.", "আজ টার্গেটের ৩ গুণ খরচ হয়েছে কিন্তু একটাও রেজাল্ট আসেনি।"],
      rule: { level: "adset", metric: "results", time_window: "today", operator: "lt", threshold: 1, min_spend: r(t * 3), min_results: 0, action: "pause", action_value: null, max_budget: null, cooldown_hours: 24 },
    },
    {
      id: "scale_winners",
      title: ["Raise budget on winners", "ভালো চললে বাজেট বাড়াও"],
      hint: ["Last 3 days cost per result below 80% of target with at least 5 results: +20% budget, at most once in 2 days.", "গত ৩ দিনে প্রতি রেজাল্টে খরচ টার্গেটের ৮০%-এর কম আর অন্তত ৫টা রেজাল্ট: বাজেট +২০%, ২ দিনে একবারের বেশি নয়।"],
      rule: { level: "adset", metric: "cost_per_result", time_window: "last_3d", operator: "lt", threshold: r(t * 0.8), min_spend: r(t * 3), min_results: 5, action: "increase_budget", action_value: 20, max_budget: null, cooldown_hours: 48 },
    },
    {
      id: "low_delivery",
      title: ["Alert on low delivery rate", "ডেলিভারি রেট কম হলে জানাও"],
      hint: ["Campaign's delivered orders below 60% in the last 7 days.", "গত ৭ দিনে ক্যাম্পেইনের ডেলিভারি রেট ৬০%-এর নিচে।"],
      rule: { level: "campaign", metric: "delivery_rate", time_window: "last_7d", operator: "lt", threshold: 60, min_spend: 0, min_results: 10, action: "notify", action_value: null, max_budget: null, cooldown_hours: 72 },
    },
    {
      id: "low_ctr",
      title: ["Alert on weak creative (low CTR)", "ক্রিয়েটিভ দুর্বল হলে জানাও (CTR কম)"],
      hint: ["Link CTR under 0.8% over 3 days: time for a new video or image.", "৩ দিনে লিংক CTR ০.৮%-এর নিচে: নতুন ভিডিও বা ছবি দরকার।"],
      rule: { level: "adset", metric: "ctr", time_window: "last_3d", operator: "lt", threshold: 0.8, min_spend: r(t * 3), min_results: 0, action: "notify", action_value: null, max_budget: null, cooldown_hours: 72 },
    },
  ];
}
