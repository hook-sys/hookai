"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/locale-actions";
import { useLocale } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import type { Locale } from "@/lib/i18n";

const OPTIONS: { id: Locale; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "bn", label: "বাং", name: "বাংলা" },
];

// Small EN / বাং toggle that sits in the top corner of every page
export default function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-900/10 bg-white/60 p-0.5 text-xs font-medium backdrop-blur-md dark:border-white/10 dark:bg-white/5",
        pending && "opacity-60",
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const active = o.id === locale;
        return (
          <button
            key={o.id}
            type="button"
            lang={o.id}
            title={o.name}
            aria-pressed={active}
            disabled={pending}
            onClick={() => {
              if (active) return;
              start(async () => {
                await setLocale(o.id);
                router.refresh();
              });
            }}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors",
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
