import { enTr, type Tr } from "@/lib/i18n";

// তারিখের হিসাব। সব তারিখ "YYYY-MM-DD" স্ট্রিং, Ad Account-এর টাইমজোনে।
// Meta-ও একইভাবে দিন গোনে, তাই আমাদের "আজ" আর Meta-র "আজ" মিলে যায়।

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Meta Insights সর্বোচ্চ ৩৭ মাস আগের ডাটা দেয়
export const MAX_LOOKBACK_MONTHS = 37;

export function todayIn(timeZone?: string | null) {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  try {
    return format(timeZone || "UTC");
  } catch {
    // অচেনা টাইমজোন হলে UTC
    return format("UTC");
  }
}

function toUtc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

// দুই তারিখসহ মোট কত দিন
export function daysInRange(since: string, until: string) {
  return Math.round((toUtc(until).getTime() - toUtc(since).getTime()) / 86_400_000) + 1;
}

export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  return fromUtc(toUtc(value)) === value; // যেমন 2026-02-31 বাতিল
}

export function minAllowedDate(today: string) {
  const d = toUtc(today);
  d.setUTCMonth(d.getUTCMonth() - MAX_LOOKBACK_MONTHS);
  return fromUtc(d);
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export const PRESETS = [
  { id: "today", en: "Today", bn: "আজ" },
  { id: "yesterday", en: "Yesterday", bn: "গতকাল" },
  { id: "last_7d", en: "Last 7 days", bn: "গত ৭ দিন" },
  { id: "last_14d", en: "Last 14 days", bn: "গত ১৪ দিন" },
  { id: "last_30d", en: "Last 30 days", bn: "গত ৩০ দিন" },
  { id: "this_month", en: "This month", bn: "এই মাস" },
  { id: "last_month", en: "Last month", bn: "গত মাস" },
  { id: "maximum", en: "Maximum", bn: "সর্বোচ্চ" },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export function presetLabel(id: PresetId, tr: Tr = enTr) {
  const p = PRESETS.find((x) => x.id === id)!;
  return tr(p.en, p.bn);
}

export type DateRange = {
  preset: PresetId | "custom";
  since: string;
  until: string;
  label: string;
};

function isPreset(value: unknown): value is PresetId {
  return PRESETS.some((p) => p.id === value);
}

function presetDates(id: PresetId, today: string, min: string): { since: string; until: string } {
  switch (id) {
    case "today":
      return { since: today, until: today };
    case "yesterday":
      return { since: addDays(today, -1), until: addDays(today, -1) };
    // Meta-র মতো "গত N দিন" মানে আজ বাদে আগের N দিন
    case "last_7d":
      return { since: addDays(today, -7), until: addDays(today, -1) };
    case "last_14d":
      return { since: addDays(today, -14), until: addDays(today, -1) };
    case "last_30d":
      return { since: addDays(today, -30), until: addDays(today, -1) };
    case "this_month":
      return { since: monthStart(today), until: today };
    case "last_month": {
      const lastDay = addDays(monthStart(today), -1);
      return { since: monthStart(lastDay), until: lastDay };
    }
    case "maximum":
      // শুরুর তারিখ পরে ডাটাবেসের সবচেয়ে পুরনো দিন দিয়ে বদলানো হয়
      return { since: min, until: today };
  }
}

// URL থেকে তারিখ বের করা। ভুল বা সীমার বাইরের মান হলে ডিফল্ট (গত ৭ দিন)।
export function resolveRange(
  params: { preset?: string; since?: string; until?: string },
  today: string,
  tr: Tr = enTr,
  // প্ল্যান অনুযায়ী সবচেয়ে পুরনো তারিখ; না দিলে Meta-র সীমা
  min: string = minAllowedDate(today),
): DateRange {

  if (params.since && params.until && isValidDate(params.since) && isValidDate(params.until)) {
    let since = params.since < min ? min : params.since;
    let until = params.until > today ? today : params.until;
    if (since > until) [since, until] = [until, since];
    if (since >= min && until <= today) {
      return { preset: "custom", since, until, label: tr("Custom", "কাস্টম") };
    }
  }

  const id: PresetId = isPreset(params.preset) ? params.preset : "last_7d";
  const dates = presetDates(id, today, min);
  return { preset: id, since: dates.since < min ? min : dates.since, until: dates.until, label: presetLabel(id, tr) };
}

// তুলনার জন্য ঠিক আগের সমান দৈর্ঘ্যের সময়
export function previousRange(since: string, until: string) {
  const length = daysInRange(since, until);
  return { since: addDays(since, -length), until: addDays(since, -1) };
}

export function formatDate(date: string) {
  return toUtc(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(since: string, until: string) {
  return since === until ? formatDate(since) : `${formatDate(since)} – ${formatDate(until)}`;
}

// ড্যাশবোর্ডের URL query, যাতে লিংক ও ফর্মে একই তারিখ থাকে
export function rangeQuery(range: Pick<DateRange, "preset" | "since" | "until">) {
  return range.preset === "custom"
    ? `since=${range.since}&until=${range.until}`
    : `preset=${range.preset}`;
}
