// ল্যান্ডিং পেজের আসল ফলাফল (গত ৩০ দিন: ২৭ সেপ্টেম্বর – ২৬ অক্টোবর ২০২৬)।
// বিজ্ঞাপনের হিসাব Meta Ads Manager থেকে, অর্ডার ক্লায়েন্টের ওয়েবসাইট থেকে। ব্র্যান্ড, পেজ বা Ad Account-এর নাম দেখানো হয় না।

export const WHATSAPP_NUMBER = "8801911110476";
export const WHATSAPP_DISPLAY = "01911-110476";
export const whatsappLink = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export const RESULTS_PERIOD = { en: "27 Sep – 26 Oct 2026", bn: "২৭ সেপ্টেম্বর – ২৬ অক্টোবর ২০২৬" };

export type CaseResult = {
  id: string;
  label: { en: string; bn: string };
  store: string;
  orders: number;
  spendUsd: number;
  impressions: number;
  clicks: number;
  messages: number;
  addToCart: number;
  dailyOrders: number[];
};

export const CASES: CaseResult[] = [
  {
    id: "fashion",
    label: { en: "Men's fashion brand", bn: "ছেলেদের ফ্যাশন ব্র্যান্ড" },
    store: "WooCommerce",
    orders: 1310,
    spendUsd: 1444.79,
    impressions: 2099885,
    clicks: 62073,
    messages: 738,
    addToCart: 5070,
    dailyOrders: [43, 40, 53, 47, 47, 35, 29, 39, 37, 38, 36, 40, 52, 49, 49, 43, 54, 43, 43, 55, 39, 50, 47, 40, 36, 39, 26, 53, 35, 29],
  },
  {
    id: "leather",
    label: { en: "Leather goods brand", bn: "লেদার পণ্যের ব্র্যান্ড" },
    store: "Shopify",
    orders: 1214,
    spendUsd: 1396.82,
    impressions: 1888164,
    clicks: 65134,
    messages: 1315,
    addToCart: 3760,
    dailyOrders: [42, 33, 33, 32, 34, 53, 29, 36, 42, 57, 37, 56, 67, 32, 65, 44, 36, 22, 20, 52, 56, 46, 50, 57, 43, 39, 18, 20, 19, 11],
  },
];

export const TOTALS = {
  orders: CASES.reduce((s, c) => s + c.orders, 0),
  spendUsd: CASES.reduce((s, c) => s + c.spendUsd, 0),
  impressions: CASES.reduce((s, c) => s + c.impressions, 0),
  messages: CASES.reduce((s, c) => s + c.messages, 0),
};
