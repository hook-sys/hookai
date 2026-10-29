"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { cn } from "@/components/ui";
import { selectClient } from "@/app/settings/actions";

// লোগোর নিচে ক্লায়েন্ট বাছাই: বাছলে সব পাতায় শুধু সেই ক্লায়েন্টের Ad Account, অর্ডার, দোকান, কুরিয়ার
export default function ClientSwitcher({
  clients,
  selectedId,
}: {
  clients: { id: string; name: string; count: number }[];
  selectedId: string | null;
}) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const current = clients.find((c) => c.id === selectedId);

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

  const choose = (id: string) => {
    setOpen(false);
    if (id === selectedId) return;
    const data = new FormData();
    data.set("clientId", id);
    startTransition(() => selectClient(data));
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 glass-chip rounded-full px-3.5 py-1 text-left text-sm hover:bg-white/95 dark:hover:bg-white/[0.14]"
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
        ) : (
          <Building2 className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">{tr("Client", "ক্লায়েন্ট")}</span>
          <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">
            {current?.name ?? tr("Pick a client", "ক্লায়েন্ট বাছো")}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-full min-w-56 xl:right-0 xl:left-auto glass-popover rounded-xl p-1.5">
          <ul role="listbox" className="max-h-80 overflow-y-auto">
            {clients.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selectedId}
                  onClick={() => choose(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    c.id === selectedId && "bg-indigo-50 dark:bg-indigo-950",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-[11px] text-zinc-400">{tr(`${c.count} ad accounts`, `${c.count}টি Ad Account`)}</span>
                  </span>
                  {c.id === selectedId && <Check className="size-4 shrink-0 text-indigo-600" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/settings#clients"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-zinc-100 px-2.5 pt-2 pb-1 text-xs text-indigo-600 hover:underline dark:border-zinc-800 dark:text-indigo-300"
          >
            {tr("Add or edit clients in Settings", "সেটিংস থেকে ক্লায়েন্ট যোগ বা বদল করো")}
          </Link>
        </div>
      )}
    </div>
  );
}
