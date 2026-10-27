"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Copy, Loader2, Trash2, XCircle } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { PRESETS } from "@/lib/meta/audiencePresets";
import { createRetargetingSet, makeLookalike, removeAudience, type AudienceState } from "./actions";

export function RetargetingSetForm({
  pixels,
  pages,
  existingFor,
}: {
  pixels: { id: string; name: string; active: boolean }[];
  pages: { id: string; name: string }[];
  existingFor: Record<string, string[]>;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<AudienceState, FormData>(createRetargetingSet, null);
  const [pixelId, setPixelId] = useState(pixels.find((p) => p.active)?.id ?? pixels[0]?.id ?? "");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const done = new Set([...(existingFor[pixelId] ?? []), ...(existingFor[pageId] ?? [])]);

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="pixel_name" value={pixels.find((p) => p.id === pixelId)?.name ?? ""} />
      <input type="hidden" name="page_name" value={pages.find((p) => p.id === pageId)?.name ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Pixel</span>
        <select name="pixel_id" value={pixelId} onChange={(e) => setPixelId(e.target.value)} className={inputClass}>
          {pixels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {!p.active ? ` (${tr("no activity", "কাজ করছে না")})` : ""}
            </option>
          ))}
          {pixels.length === 0 && <option value="">{tr("No pixel in this account", "এই অ্যাকাউন্টে কোনো Pixel নেই")}</option>}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Facebook page", "Facebook পেজ")}</span>
        <select name="page_id" value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputClass}>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">{tr("Audiences to make", "যেগুলো বানাবে")}</legend>
        {PRESETS.map((p) => {
          const exists = done.has(p.id);
          const disabled = exists || (p.needs === "pixel" && !pixelId) || (p.needs === "page" && !pageId);
          return (
            <label key={p.id} className={disabled ? "flex items-start gap-2 opacity-60" : "flex cursor-pointer items-start gap-2"}>
              <input type="checkbox" name="presets" value={p.id} defaultChecked={!disabled} disabled={disabled} className="mt-0.5 accent-indigo-600" />
              <span>
                <span className="block font-medium">
                  {tr(p.name[0], p.name[1])}
                  {exists && <span className="ml-1 text-xs font-normal text-emerald-600">✓ {tr("exists", "আছে")}</span>}
                </span>
                <span className="block text-xs text-zinc-500">{tr(p.hint[0], p.hint[1])}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {state && !state.ok && <p role="alert" className="text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.ok && (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-emerald-700 dark:text-emerald-400">{state.message}</p>
          {state.lines?.map((l) => (
            <p key={l.name} className="flex items-start gap-1.5 text-xs">
              {l.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden />}
              <span>
                {l.name}
                {l.note && <span className="text-zinc-500"> · {l.note}</span>}
              </span>
            </p>
          ))}
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {tr("Create audiences", "অডিয়েন্স বানাও")}
      </button>
      <p className="text-xs text-zinc-500">
        {tr("Audiences are free. Meta fills them over a few hours; small ones may stay empty until more people visit.", "অডিয়েন্স বানাতে টাকা লাগে না। Meta কয়েক ঘণ্টায় ভরে দেয়; ছোট অডিয়েন্স বেশি ভিজিটর না আসা পর্যন্ত খালি থাকতে পারে।")}
      </p>
    </form>
  );
}

export function AudienceRowActions({ id, name, canLookalike }: { id: string; name: string; canLookalike: boolean }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<AudienceState, FormData>(makeLookalike, null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {canLookalike && (
          <form action={action} className="flex items-center gap-1">
            <input type="hidden" name="id" value={id} />
            <select name="percent" defaultValue="1" aria-label={tr("Lookalike size", "Lookalike আকার")} className={inputClass + " w-16 px-1.5 py-1 text-xs"}>
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending} className={buttonClass("ghost", "px-1.5 text-xs")} title={tr("Make a lookalike in Bangladesh", "বাংলাদেশে Lookalike বানাও")}>
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              Lookalike
            </button>
          </form>
        )}
        <form
          action={removeAudience}
          onSubmit={(e) => {
            if (!window.confirm(tr(`Delete "${name}" from Meta? Ads using it lose this audience.`, `"${name}" Meta থেকে মুছবে? যে বিজ্ঞাপনে আছে সেখান থেকেও চলে যাবে।`))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={buttonClass("danger", "px-1.5 text-xs")} aria-label={tr("Delete", "মুছো")}>
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </form>
      </div>
      {state && <span className={state.ok ? "text-xs text-emerald-600" : "max-w-[16rem] text-right text-xs text-red-600"}>{state.ok ? state.message : state.error}</span>}
    </div>
  );
}
