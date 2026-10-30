"use client";

import { useActionState, useState } from "react";
import { ClipboardPaste, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { addCompetitor, analyzeAds, makeReport, refreshCompetitor, type CompState } from "./actions";

function Msg({ state }: { state: CompState }) {
  if (!state) return null;
  return <p className={cn("text-xs", state.ok ? "text-emerald-300" : "text-red-400")}>{state.ok ? state.message : state.error}</p>;
}

export function AddCompetitorForm() {
  const tr = useTr();
  const [state, action, pending] = useActionState<CompState, FormData>(addCompetitor, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="name" required maxLength={120} placeholder={tr("Name (e.g. Ghorerbazar)", "নাম (যেমন Ghorerbazar)")} className={inputClass} aria-label={tr("Name", "নাম")} />
        <input name="website_url" placeholder={tr("Website (optional)", "ওয়েবসাইট (ইচ্ছা হলে)")} className={inputClass} aria-label={tr("Website", "ওয়েবসাইট")} />
        <input
          name="ad_library_query"
          maxLength={200}
          placeholder={tr("Ad Library name or page ID (optional)", "Ad Library-তে নাম বা পেজ আইডি (ইচ্ছা হলে)")}
          className={inputClass}
          aria-label="Ad Library"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {tr("Add competitor", "প্রতিযোগী যোগ করো")}
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function RefreshSiteButton({ id }: { id: string }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<CompState, FormData>(refreshCompetitor, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "px-3 py-1.5 text-xs")}>
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        {tr("Check website now", "ওয়েবসাইট এখন দেখো")}
      </button>
      <Msg state={state} />
    </form>
  );
}

// Ad Library পাতা কপি করে এখানে পেস্ট
export function PasteAdsForm({ id }: { id: string }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CompState, FormData>(analyzeAds, null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "px-3 py-1.5 text-xs")}>
        <ClipboardPaste className="size-3.5" aria-hidden />
        {tr("Paste Ad Library", "Ad Library পেস্ট করো")}
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-zinc-400">
        {tr(
          "On the Ad Library page scroll down to load more ads, then press Ctrl+A and Ctrl+C, and paste here (Ctrl+V).",
          "Ad Library পাতায় নিচে স্ক্রল করে আরও বিজ্ঞাপন লোড করো, তারপর Ctrl+A আর Ctrl+C চেপে এখানে পেস্ট করো (Ctrl+V)।",
        )}
      </p>
      <textarea name="text" required rows={5} placeholder="Ctrl+V" className={inputClass} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary", "px-3 py-1.5 text-xs")}>
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {tr("Analyse", "বিশ্লেষণ করো")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "px-3 py-1.5 text-xs")}>
          {tr("Close", "বন্ধ")}
        </button>
        <Msg state={state} />
      </div>
    </form>
  );
}

export function ReportButton({ hasReport }: { hasReport: boolean }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<CompState, FormData>(makeReport, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {pending ? tr("Researching…", "গবেষণা চলছে…") : hasReport ? tr("New AI report", "নতুন AI রিপোর্ট") : tr("Make AI report", "AI রিপোর্ট বানাও")}
      </button>
      <Msg state={state} />
    </form>
  );
}
