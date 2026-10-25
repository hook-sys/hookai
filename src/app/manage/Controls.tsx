"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn } from "@/components/ui";
import { changeDailyBudget, changeStatus, type ManageState } from "./actions";

function Feedback({ state }: { state: ManageState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn("mt-1 text-xs", state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}

// চালু/বন্ধ সুইচ: চাপলে আগে নিশ্চিত হতে চায়, তারপর Meta-তে পাঠায়
export function StatusSwitch({
  id,
  level,
  name,
  active,
}: {
  id: string;
  level: "campaign" | "adset" | "ad";
  name: string;
  active: boolean;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<ManageState, FormData>(changeStatus, null);
  const next = active ? "PAUSED" : "ACTIVE";
  const shown = state?.ok ? !active : active;
  return (
    <div className="shrink-0">
      <form
        action={action}
        onSubmit={(e) => {
          const ok = window.confirm(
            active ? tr(`Turn OFF "${name}"?`, `"${name}" বন্ধ করবে?`) : tr(`Turn ON "${name}"? It will start spending.`, `"${name}" চালু করবে? খরচ শুরু হবে।`),
          );
          if (!ok) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="status" value={next} />
        <button
          type="submit"
          disabled={pending}
          role="switch"
          aria-checked={shown}
          aria-label={shown ? tr(`Turn off ${name}`, `${name} বন্ধ করো`) : tr(`Turn on ${name}`, `${name} চালু করো`)}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60",
            shown ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700",
          )}
        >
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", shown ? "translate-x-5" : "translate-x-0.5")} />
          {pending && <Loader2 className="absolute -right-6 size-4 animate-spin text-zinc-400" aria-hidden />}
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}

// দৈনিক বাজেট: নিজে লেখা বা ±২০% বাটন, সেভের আগে নিশ্চিত হতে চায়
export function BudgetEditor({
  id,
  level,
  name,
  budget,
  currency,
}: {
  id: string;
  level: "campaign" | "adset";
  name: string;
  budget: number;
  currency: string | null;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<ManageState, FormData>(changeDailyBudget, null);
  const [value, setValue] = useState(budget.toFixed(2));
  const formRef = useRef<HTMLFormElement>(null);
  const step = (pct: number) => setValue((Math.max(0.01, Number(value) * (1 + pct)) || budget).toFixed(2));
  const changed = Number(value) !== Number(budget.toFixed(2));

  return (
    <div className="min-w-0">
      <form
        ref={formRef}
        action={action}
        onSubmit={(e) => {
          const ok = window.confirm(
            tr(
              `Change daily budget of "${name}" from ${budget.toFixed(2)} to ${Number(value).toFixed(2)} ${currency ?? ""}?`,
              `"${name}"-এর দৈনিক বাজেট ${budget.toFixed(2)} থেকে ${Number(value).toFixed(2)} ${currency ?? ""} করবে?`,
            ),
          );
          if (!ok) e.preventDefault();
        }}
        className="flex flex-wrap items-center gap-1.5"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="level" value={level} />
        <span className="text-xs text-zinc-500">{tr("Daily", "দৈনিক")}</span>
        <button type="button" onClick={() => step(-0.2)} className={buttonClass("secondary", "px-2 py-1 text-xs")}>
          −20%
        </button>
        <input
          name="amount"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={tr(`Daily budget for ${name}`, `${name}-এর দৈনিক বাজেট`)}
          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">{currency}</span>
        <button type="button" onClick={() => step(0.2)} className={buttonClass("secondary", "px-2 py-1 text-xs")}>
          +20%
        </button>
        <button type="submit" disabled={pending || !changed} className={buttonClass("primary", "px-3 py-1 text-xs")}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : tr("Save", "সেভ")}
        </button>
      </form>
      <Feedback state={state} />
    </div>
  );
}
