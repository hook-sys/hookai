"use client";

import { useActionState, useState, useTransition } from "react";
import { FlaskConical, Loader2, Plus, Search } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { addPixel, findPixels, saveCapi, saveWebsite, testCapi, type AssetState, type PixelChoice } from "./actions";

function Result({ state }: { state: AssetState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function WebsiteForm({ url, disabled }: { url: string; disabled: boolean }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<AssetState, FormData>(saveWebsite, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input name="website_url" defaultValue={url} placeholder="https://example.com" disabled={disabled} className={inputClass} />
        <button type="submit" disabled={pending || disabled} className={buttonClass("secondary", "shrink-0")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
          {tr("Check", "যাচাই")}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

// ব্যবহারকারীর BM-গুলো থেকে Pixel খুঁজে এই Ad Account-এ যোগ
export function AddPixelPanel({ existing }: { existing: string[] }) {
  const tr = useTr();
  const [list, setList] = useState<PixelChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AssetState>(null);
  const [loading, startLoad] = useTransition();
  const [adding, startAdd] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  if (!list) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            startLoad(async () => {
              const r = await findPixels();
              if (r.ok) setList(r.pixels.filter((p) => !existing.includes(p.id)));
              else setError(r.error);
            })
          }
          className={buttonClass("secondary", "self-start")}
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {tr("Add a pixel from your business portfolios", "তোমার BM থেকে Pixel যোগ করো")}
        </button>
        {loading && <span className="text-xs text-zinc-500">{tr("Searching all your business portfolios…", "সব BM-এ খোঁজা হচ্ছে…")}</span>}
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }
  const shown = list.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search pixel name or ID", "Pixel-এর নাম বা ID খোঁজো")} className={inputClass} />
      <ul className="max-h-64 overflow-y-auto rounded-lg border border-zinc-900/10 dark:border-white/10">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-2 border-b border-zinc-900/[0.05] px-3 py-2 last:border-0 dark:border-white/[0.06]">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate font-mono text-[11px] text-zinc-400">
                {p.id} · {p.businesses.map((b) => b.name).join(", ")}
              </span>
            </span>
            <button
              type="button"
              disabled={adding}
              onClick={() => {
                setBusy(p.id);
                startAdd(async () => {
                  const r = await addPixel(p.id, p.businesses.map((b) => b.id));
                  setState(r);
                  if (r?.ok) setList((l) => (l ?? []).filter((x) => x.id !== p.id));
                  setBusy(null);
                });
              }}
              className={buttonClass("ghost", "shrink-0 px-2 text-xs")}
            >
              {adding && busy === p.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              {tr("Add", "যোগ")}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-zinc-500">{tr("No other pixels found.", "আর কোনো Pixel পাওয়া যায়নি।")}</li>}
      </ul>
      <Result state={state} />
    </div>
  );
}

export function CapiForm({
  disabled,
  pixels,
  pixelId,
  enabled,
  sendConfirmed,
  sendDelivered,
}: {
  disabled: boolean;
  pixels: { id: string; name: string }[];
  pixelId: string;
  enabled: boolean;
  sendConfirmed: boolean;
  sendDelivered: boolean;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<AssetState, FormData>(saveCapi, null);
  const [test, testAction, testing] = useActionState<AssetState, FormData>(testCapi, null);
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Send to pixel", "যে Pixel-এ পাঠাবে")}</span>
          <select name="capi_pixel_id" defaultValue={pixelId} disabled={disabled} className={inputClass}>
            <option value="">{tr("Choose…", "বাছো…")}</option>
            {pixels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">{tr("Use the pixel that's on the website.", "ওয়েবসাইটে যে Pixel বসানো, সেটাই বাছো।")}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="capi_send_confirmed" defaultChecked={sendConfirmed} disabled={disabled} className="accent-indigo-600" />
          {tr("Send confirmed orders (OrderConfirmed)", "কনফার্ম অর্ডার পাঠাও (OrderConfirmed)")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="capi_send_delivered" defaultChecked={sendDelivered} disabled={disabled} className="accent-indigo-600" />
          {tr("Send delivered orders (OrderDelivered)", "ডেলিভারি হওয়া অর্ডার পাঠাও (OrderDelivered)")}
        </label>
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="capi_enabled" defaultChecked={enabled} disabled={disabled} className="accent-indigo-600" />
          {tr("Turn on (every hour)", "চালু করো (প্রতি ঘণ্টায়)")}
        </label>
        <Result state={state} />
        <button type="submit" disabled={pending || disabled} className={buttonClass("primary", "self-start")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tr("Save", "সংরক্ষণ")}
        </button>
      </form>
      <form action={testAction} className="flex flex-col gap-2 border-t border-zinc-900/[0.06] pt-4 text-sm dark:border-white/[0.07]">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Test without counting", "গোনা ছাড়া পরীক্ষা")}</span>
        <span className="text-xs text-zinc-500">
          {tr("Events Manager → your pixel → Test events → copy the code (TEST…).", "Events Manager → তোমার Pixel → Test events → কোডটা কপি করো (TEST…)।")}
        </span>
        <div className="flex gap-2">
          <input name="test_code" placeholder="TEST12345" disabled={disabled} className={inputClass} />
          <button type="submit" disabled={testing || disabled} className={buttonClass("secondary", "shrink-0")}>
            {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
            {tr("Send test", "টেস্ট পাঠাও")}
          </button>
        </div>
        <Result state={test} />
      </form>
    </div>
  );
}
