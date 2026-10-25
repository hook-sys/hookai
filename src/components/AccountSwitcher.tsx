"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Search, Settings2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import { selectAdAccount, selectClient } from "@/app/settings/actions";
import type { AccountOption } from "@/lib/meta/accountsCache";

export type SwitcherClient = { id: string; name: string; accountIds: string[] };

// উপরের ক্লায়েন্ট ও Ad Account বদলের মেনু: যেকোনো পাতা থেকে সেটিংসে না গিয়েই বদলানো যায়
export default function AccountSwitcher({
  accounts,
  clients,
  selectedId,
  selectedName,
  selectedClientId,
}: {
  accounts: AccountOption[];
  clients: SwitcherClient[];
  selectedId: string | null;
  selectedName: string | null;
  selectedClientId: string | null;
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

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (a: AccountOption) => !q || a.name.toLowerCase().includes(q) || a.id.includes(q);
    const assigned = new Set(clients.flatMap((c) => c.accountIds));
    const clientGroups = clients
      .map((c) => ({
        client: c,
        items: c.accountIds
          .map((id) => byId.get(id) ?? { id, name: id, active: true })
          .filter((a) => match(a) || c.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0 || !q || g.client.name.toLowerCase().includes(q));
    const rest = accounts
      .filter((a) => !assigned.has(a.id) && match(a))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return { clientGroups, rest };
  }, [accounts, clients, byId, query]);

  const clientName = clients.find((c) => c.id === selectedClientId)?.name;

  const run = (fn: (d: FormData) => Promise<void>, key: string, value: string) => {
    const data = new FormData();
    data.set(key, value);
    setOpen(false);
    startTransition(() => fn(data));
  };

  const accountRow = (a: AccountOption, clientId: string | null) => (
    <li key={`${clientId ?? "none"}-${a.id}`}>
      <button
        type="button"
        role="option"
        aria-selected={a.id === selectedId}
        onClick={() => (a.id === selectedId ? setOpen(false) : run(selectAdAccount, "accountId", a.id))}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
          a.id === selectedId && "bg-indigo-50 dark:bg-indigo-950",
          clientId && "pl-5",
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
  );

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-[20rem] items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {pending && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
        <span className="truncate">
          {clientName && <span className="text-indigo-600 dark:text-indigo-300">{clientName} · </span>}
          {selectedName ?? tr("Pick an ad account", "Ad Account বেছে নাও")}
        </span>
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
              placeholder={tr("Search clients or ad accounts", "ক্লায়েন্ট বা Ad Account খোঁজো")}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-2 pl-8 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <ul role="listbox" className="mt-1 max-h-96 overflow-y-auto">
            {groups.clientGroups.map(({ client, items }) => (
              <li key={client.id} className="mt-1">
                <button
                  type="button"
                  onClick={() => (client.id === selectedClientId ? setOpen(false) : run(selectClient, "clientId", client.id))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    client.id === selectedClientId && "text-indigo-600 dark:text-indigo-300",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  {client.id === selectedClientId && <Check className="size-3.5" aria-hidden />}
                </button>
                <ul>
                  {items.map((a) => accountRow(a, client.id))}
                  {items.length === 0 && (
                    <li className="px-5 py-1 text-xs text-zinc-400">{tr("No ad accounts yet", "এখনো কোনো Ad Account নেই")}</li>
                  )}
                </ul>
              </li>
            ))}
            {groups.rest.length > 0 && (
              <li className="mt-2 border-t border-zinc-100 pt-1 dark:border-zinc-800">
                <p className="px-2.5 py-1.5 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  {tr("Not in a client", "কোনো ক্লায়েন্টে নেই")}
                </p>
                <ul>{groups.rest.map((a) => accountRow(a, null))}</ul>
              </li>
            )}
          </ul>
          <Link
            href="/clients"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded-lg border-t border-zinc-100 px-2.5 pt-2 pb-1 text-sm text-indigo-600 hover:underline dark:border-zinc-800 dark:text-indigo-300"
          >
            <Settings2 className="size-4" aria-hidden />
            {tr("Manage clients", "ক্লায়েন্ট সাজাও")}
          </Link>
        </div>
      )}
    </div>
  );
}
