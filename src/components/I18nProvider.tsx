"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeTr, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useTr() {
  const locale = useLocale();
  return useMemo(() => makeTr(locale), [locale]);
}
