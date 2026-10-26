"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { deleteClient, saveClient, type ClientFormState } from "./actions";

export type AccountChoice = { id: string; name: string; active: boolean; ownerName: string | null };

export default function ClientForm({
  id,
  name,
  accounts,
  checked,
}: {
  id?: string;
  name?: string;
  accounts: AccountChoice[];
  checked: string[];
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClient, null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(new Set(checked));
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q)) : accounts;
    // টিক দেওয়া আগে, তারপর চালু অ্যাকাউন্ট
    return [...list].sort(
      (a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    );
  }, [accounts, query, picked]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Client name", "ক্লায়েন্টের নাম")}</span>
        <input name="name" required maxLength={80} defaultValue={name} placeholder="Formal Men BD" className={inputClass} />
      </label>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium text-zinc-700 dark:text-zinc-300">
          {tr(`Ad accounts (${picked.size} chosen)`, `Ad Account (${picked.size}টি বাছা)`)}
        </legend>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-zinc-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search ad accounts", "Ad Account খোঁজো")}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-2 pl-8 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          {visible.map((a) => (
            <li key={a.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/50 dark:hover:bg-zinc-800/50">
                <input
                  type="checkbox"
                  name="accounts"
                  value={a.id}
                  checked={picked.has(a.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(a.id);
                    else next.delete(a.id);
                    setPicked(next);
                  }}
                  className="size-4 accent-indigo-600"
                />
                <span className="min-w-0 flex-1">
                  <span className={a.active ? "block truncate" : "block truncate text-zinc-400"}>{a.name}</span>
                  <span className="block font-mono text-[11px] text-zinc-400">
                    {a.id}
                    {a.ownerName && ` · ${tr(`now in ${a.ownerName}`, `এখন ${a.ownerName}-এ`)}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <span className="text-xs text-zinc-500">
          {tr(
            "An ad account belongs to one client. Ticking one that's in another client moves it here.",
            "একটা Ad Account একটাই ক্লায়েন্টের। অন্য ক্লায়েন্টের অ্যাকাউন্টে টিক দিলে সেটা এখানে সরে আসবে।",
          )}
        </span>
      </fieldset>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {id ? tr("Save changes", "পরিবর্তন সেভ করো") : tr("Create client", "ক্লায়েন্ট তৈরি করো")}
      </button>
    </form>
  );
}

// ক্লায়েন্ট মোছার আগে নিশ্চিত হতে চায়
export function DeleteClientButton({ id, name, label }: { id: string; name: string; label: string }) {
  const tr = useTr();
  return (
    <form
      action={deleteClient}
      onSubmit={(e) => {
        if (!window.confirm(tr(`Delete "${name}"? Its website and courier connections are removed too.`, `"${name}" মুছে ফেলবে? এর ওয়েবসাইট আর কুরিয়ার সংযোগও মুছে যাবে।`))) e.preventDefault();
      }}
      className="mt-4"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={buttonClass("danger", "px-0")}>
        {label}
      </button>
    </form>
  );
}
