// সংখ্যা দেখানোর নিয়ম এক জায়গায়। null মানে হিসাব করা যায়নি (যেমন হর শূন্য)।
const DASH = "—";

export function formatMoney(value: number | null, currency?: string | null) {
  if (value === null) return DASH;
  if (!currency) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // অচেনা মুদ্রা কোড হলে সংখ্যার পাশে কোড দেখায়
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function formatNumber(value: number | null, digits = 0) {
  if (value === null) return DASH;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatPercent(value: number | null) {
  if (value === null) return DASH;
  return `${value.toFixed(2)}%`;
}

export function formatRoas(value: number | null) {
  if (value === null) return DASH;
  return `${value.toFixed(2)}x`;
}
