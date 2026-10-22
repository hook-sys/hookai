"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AdAccount } from "@/lib/meta/graph";
import { buttonClass, inputClass } from "@/components/ui";
import { selectAdAccount } from "./actions";

// অনেক Ad Account থাকলে নাম বা ID দিয়ে খুঁজে বের করা যায়
export default function AdAccountPicker({
  accounts,
  selectedId,
}: {
  accounts: AdAccount[];
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");

  // বর্তমানে নির্বাচিত Ad Account সবার উপরে, যাতে খুঁজতে না হয়
  const ordered = useMemo(
    () => [
      ...accounts.filter((a) => a.id === selectedId),
      ...accounts.filter((a) => a.id !== selectedId),
    ],
    [accounts, selectedId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [ordered, query]);

  return (
    <form action={selectAdAccount} className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Ad Account খোঁজো</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${accounts.length}টি Ad Account-এর মধ্যে নাম বা ID দিয়ে খোঁজো`}
          className={`${inputClass} pl-9`}
        />
      </label>

      <fieldset className="max-h-[28rem] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <legend className="sr-only">কোন Ad Account নিয়ে কাজ করবে?</legend>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">কিছু পাওয়া যায়নি।</p>
        )}
        {visible.map((acc) => (
          <label
            key={acc.id}
            className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0 hover:bg-zinc-50 has-[:checked]:bg-indigo-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 dark:has-[:checked]:bg-indigo-950"
          >
            <input
              type="radio"
              name="accountId"
              value={acc.id}
              defaultChecked={acc.id === selectedId}
              className="size-4"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">
                {acc.name}
              </span>
              <span className="block font-mono text-xs text-zinc-500">{acc.id}</span>
            </span>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {acc.currency}
            </span>
          </label>
        ))}
      </fieldset>

      <button type="submit" className={buttonClass("primary", "w-fit")}>
        সংরক্ষণ করো
      </button>
    </form>
  );
}
