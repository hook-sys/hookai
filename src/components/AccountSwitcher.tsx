"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import { selectAdAccount } from "@/app/settings/actions";
import type { AccountOption } from "@/lib/meta/accountsCache";

// উপরের Ad Account বদলের মেনু: যেকোনো পাতা থেকে সেটিংসে না গিয়েই অ্যাকাউন্ট বদলানো যায়
export default function AccountSwitcher({
  accounts,
  selectedId,
  selectedName,
}: {
  accounts: AccountOption[];
  selectedId: string | null;
  selectedName: string | null;
}) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q)) : accounts;
    // চালু অ্যাকাউন্ট আগে
    return [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [accounts, query]);

  const choose = (id: string) => {
    if (id === selectedId) return setOpen(false);
    const data = new FormData();
    data.set("accountId", id);
    setOpen(false);
    startTransition(() => selectAdAccount(data));
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-[15rem] items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
        <span className="truncate">{selectedName ?? tr("Pick an ad account", "Ad Account বেছে নাও")}</span>
        <ChevronDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-zinc-400" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Search ad accounts", "Ad Account খোঁজো")}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-2 pl-8 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <ul role="listbox" className="mt-1 max-h-80 overflow-y-auto">
            {visible.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.id === selectedId}
                  onClick={() => choose(a.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    a.id === selectedId && "bg-indigo-50 dark:bg-indigo-950",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", !a.active && "text-zinc-400")}>{a.name}</span>
                    <span className="block font-mono text-[11px] text-zinc-400">
                      {a.id}
                      {!a.active && ` · ${tr("disabled", "বন্ধ")}`}
                    </span>
                  </span>
                  {a.id === selectedId && <Check className="size-4 shrink-0 text-indigo-600" aria-hidden />}
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-2.5 py-3 text-sm text-zinc-500">{tr("No match", "কিছু পাওয়া যায়নি")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
