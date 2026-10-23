import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeTr, normalizeLocale } from "@/lib/i18n";

export async function getLocale() {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getTr() {
  return makeTr(await getLocale());
}
