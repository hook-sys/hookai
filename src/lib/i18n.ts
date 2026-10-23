// Two languages: English (default) and Bangla. The choice lives in a cookie so the
// server renders the right language on the first request.
// Text is written inline as tr("English", "বাংলা") next to where it is used.

export type Locale = "en" | "bn";

export const LOCALE_COOKIE = "lang";

export function normalizeLocale(value?: string | null): Locale {
  return value === "bn" ? "bn" : "en";
}

export type Tr = <T>(en: T, bn: T) => T;

export function makeTr(locale: Locale): Tr {
  return (en, bn) => (locale === "bn" ? bn : en);
}

// Default for library code that may be called without a locale (cron, background work)
export const enTr: Tr = makeTr("en");
