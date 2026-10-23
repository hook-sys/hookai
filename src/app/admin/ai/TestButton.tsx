"use client";

import { useActionState } from "react";
import { PlugZap } from "lucide-react";
import { buttonClass, cn } from "@/components/ui";
import { useTr } from "@/components/I18nProvider";
import { testProvider, type TestState } from "./actions";

export default function TestButton({ provider }: { provider: string }) {
  const tr = useTr();
  const [state, formAction, pending] = useActionState<TestState, FormData>(
    testProvider,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="provider" value={provider} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "w-fit")}>
        <PlugZap className="size-4" aria-hidden />
        {pending ? tr("Testing…", "পরীক্ষা চলছে...") : tr("Test connection", "সংযোগ পরীক্ষা করো")}
      </button>
      {state && (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
          )}
        >
          {state.ok ? tr("Working: ", "কাজ করছে: ") : tr("Failed: ", "ব্যর্থ: ")}
          {state.message}
        </p>
      )}
    </form>
  );
}
