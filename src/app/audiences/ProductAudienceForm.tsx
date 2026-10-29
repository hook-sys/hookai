"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Film, Globe2, Loader2, Search, XCircle } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { createProductAudiences, findProductAds, type ProductAudienceState, type ProductLookup } from "./actions";

// প্রোডাক্টের লিংক দিয়ে অডিয়েন্স: সেই লিংকের বিজ্ঞাপনের ভিডিও দর্শক আর সেই পাতার ওয়েবসাইট ভিজিটর

const VIDEO: [string, string, string][] = [
  ["v25", "25%", "২৫%"],
  ["v50", "50%", "৫০%"],
  ["v75", "75%", "৭৫%"],
  ["v95", "95%", "৯৫%"],
  ["thruplay", "ThruPlay", "ThruPlay"],
];
const WEB: [string, string, string][] = [
  ["visitors", "Visited the page", "পাতায় এসেছে"],
  ["viewed", "Viewed the product", "প্রোডাক্ট দেখেছে"],
  ["cart", "Added to cart, didn't buy", "কার্টে রেখেছে, কেনেনি"],
  ["checkout", "Started checkout, didn't buy", "চেকআউট শুরু করেছে, কেনেনি"],
  ["buyers", "Bought", "কিনেছে"],
];
const DAYS = [7, 14, 30, 60, 90, 180, 365];

function Chip({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition-colors peer-checked:border-indigo-400/60 peer-checked:bg-indigo-500/15 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-400">
        {label}
      </span>
    </label>
  );
}

export default function ProductAudienceForm({ pixels }: { pixels: { id: string; name: string; active: boolean }[] }) {
  const tr = useTr();
  const [url, setUrl] = useState("");
  const [lookup, setLookup] = useState<ProductLookup | null>(null);
  const [finding, startFind] = useTransition();
  const [state, action, pending] = useActionState<ProductAudienceState, FormData>(createProductAudiences, null);
  const found = lookup?.ok ? lookup : null;
  const matched = found?.ads.filter((a) => a.matched) ?? [];

  return (
    <div className="flex flex-col gap-4 text-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startFind(async () => setLookup(await findProductAds(url)));
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor="product-url" className="font-medium text-zinc-300">
          {tr("Product or website link", "প্রোডাক্ট বা ওয়েবসাইটের লিংক")}
        </label>
        <div className="flex gap-2">
          <input
            id="product-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://site.com/product-name/"
            className={inputClass}
            required
          />
          <button type="submit" disabled={finding} className={buttonClass("secondary", "shrink-0")}>
            {finding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            {tr("Find ads", "বিজ্ঞাপন খোঁজো")}
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          {tr("A product page gives audiences for that product; the main website link gives the whole site.", "প্রোডাক্টের পাতা দিলে শুধু সেই প্রোডাক্টের, মূল ওয়েবসাইটের লিংক দিলে পুরো সাইটের অডিয়েন্স।")}
        </span>
      </form>

      {lookup && !lookup.ok && <p className="text-red-400">{lookup.error}</p>}

      {found && (
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="url" value={url} />
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-zinc-300">{tr("Name in the audience list", "অডিয়েন্সের নামে যা থাকবে")}</span>
            <input name="label" defaultValue={found.label} maxLength={60} className={inputClass} />
          </label>

          {/* ভিডিও দর্শক */}
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 flex items-center gap-2 font-medium text-zinc-100">
              <Film className="size-4 text-indigo-300" aria-hidden />
              {tr("Video viewers of these ads", "এই বিজ্ঞাপনগুলোর ভিডিও দর্শক")}
            </legend>
            <p className="text-xs text-zinc-500">
              {matched.length
                ? tr(`${matched.length} ad(s) go to this link and are ticked. Tick others if needed.`, `${matched.length}টা বিজ্ঞাপন এই লিংকে যায়, টিক দেওয়া আছে। দরকার হলে অন্যগুলোতেও টিক দাও।`)
                : tr("No ad shows this link (ads made from a post hide it). Tick the right ads by name.", "কোনো বিজ্ঞাপনে এই লিংক পাওয়া যায়নি (পোস্ট থেকে বানানো বিজ্ঞাপনে লিংক দেখা যায় না)। নাম দেখে সঠিক বিজ্ঞাপনে টিক দাও।")}
            </p>
            <ul className="max-h-56 overflow-y-auto rounded-2xl border border-white/[0.08]">
              {found.ads.map((a) => (
                <li key={a.id} className="border-b border-white/[0.05] last:border-0">
                  <label className={cn("flex cursor-pointer items-start gap-2.5 px-3 py-2", a.videos.length === 0 && "opacity-50")}>
                    <input type="checkbox" name="ads" value={a.id} defaultChecked={a.matched && a.videos.length > 0} disabled={a.videos.length === 0} className="mt-0.5 accent-indigo-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-100">{a.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {a.status === "ACTIVE" ? tr("Active", "চালু") : tr("Off", "বন্ধ")} ·{" "}
                        {a.videos.length ? tr(`${a.videos.length} video`, `${a.videos.length}টা ভিডিও`) : tr("no video", "ভিডিও নেই")} · {a.link ?? tr("link not visible", "লিংক দেখা যায় না")}
                      </span>
                    </span>
                    {a.matched && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">{tr("this link", "এই লিংক")}</span>}
                  </label>
                </li>
              ))}
              {found.ads.length === 0 && <li className="px-3 py-3 text-zinc-500">{tr("No ads in this account.", "এই অ্যাকাউন্টে কোনো বিজ্ঞাপন নেই।")}</li>}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {VIDEO.map(([v, en, bn]) => (
                <Chip key={v} name="video" value={v} label={tr(`${en} viewers`, `${bn} দেখেছে`)} defaultChecked={v === "v50" || v === "v75" || v === "v95"} />
              ))}
              <select name="video_days" defaultValue={30} aria-label={tr("Video audience days", "ভিডিও অডিয়েন্সের দিন")} className={cn(inputClass, "w-auto py-1.5 text-xs")}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {tr(`${d} days`, `${d} দিন`)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {/* ওয়েবসাইট */}
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 flex items-center gap-2 font-medium text-zinc-100">
              <Globe2 className="size-4 text-indigo-300" aria-hidden />
              {found.whole ? tr("Website visitors (whole site)", "ওয়েবসাইটের ভিজিটর (পুরো সাইট)") : tr("Visitors of this product page", "এই প্রোডাক্ট পাতার ভিজিটর")}
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {WEB.map(([v, en, bn]) => (
                <Chip key={v} name="web" value={v} label={tr(en, bn)} defaultChecked={v === "visitors" || v === "viewed" || v === "cart"} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="pixel_id" defaultValue={pixels.find((p) => p.active)?.id ?? pixels[0]?.id} aria-label="Pixel" className={inputClass}>
                {pixels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? ` (${tr("no activity", "কাজ করছে না")})` : ""}
                  </option>
                ))}
                {pixels.length === 0 && <option value="">{tr("No pixel in this account", "এই অ্যাকাউন্টে কোনো Pixel নেই")}</option>}
              </select>
              <select name="web_days" defaultValue={30} aria-label={tr("Website audience days", "ওয়েবসাইট অডিয়েন্সের দিন")} className={inputClass}>
                {DAYS.filter((d) => d <= 180).map((d) => (
                  <option key={d} value={d}>
                    {tr(`${d} days`, `${d} দিন`)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {tr("Make these audiences", "অডিয়েন্সগুলো বানাও")}
          </button>

          {state && !state.ok && <p className="text-red-400">{state.error}</p>}
          {state?.ok && (
            <div className="flex flex-col gap-2">
              <p className="text-emerald-300">{state.message}</p>
              <ul className="flex flex-col gap-1">
                {state.lines.map((l) => (
                  <li key={l.name} className="flex items-start gap-2 text-xs">
                    {l.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-hidden />}
                    <span>
                      <span className="text-zinc-200">{l.name}</span>
                      {l.note && <span className="text-zinc-500"> · {l.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {state.termsUrl && (
                <a href={state.termsUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "self-start text-xs")}>
                  {tr("Open Meta's Custom Audience terms", "Meta-র Custom Audience শর্ত খোলো")} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
