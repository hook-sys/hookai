"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Play, Plus, Power, Rocket, Search, X } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { SALES_CTAS, type LaunchSpec } from "@/lib/meta/launch";
import { activateLaunch, deleteDraft, launchOnMeta, saveSpec, searchTargeting, type LaunchState } from "../actions";

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: "Shop now",
  ORDER_NOW: "Order now",
  BUY_NOW: "Buy now",
  LEARN_MORE: "Learn more",
  GET_OFFER: "Get offer",
  SIGN_UP: "Sign up",
};

function Result({ state }: { state: LaunchState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-red-600 dark:text-red-400"}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

type Chip = { key: string; name: string; type: string };

// লোকেশন বা আগ্রহ: চিপ হিসেবে দেখায়, Meta-তে খুঁজে যোগ করা যায়
function TargetPicker({
  kind,
  label,
  value,
  onChange,
  disabled,
}: {
  kind: "location" | "interest";
  label: string;
  value: Chip[];
  onChange: (v: Chip[]) => void;
  disabled: boolean;
}) {
  const tr = useTr();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Chip[]>([]);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      startSearch(async () => setHits(await searchTargeting(kind, q)));
    }, 350);
    return () => clearTimeout(t);
  }, [q, kind]);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {value.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 rounded-full glass-chip px-2.5 py-1 text-xs">
            {c.name}
            {!disabled && (
              <button type="button" aria-label={tr("Remove", "সরাও")} onClick={() => onChange(value.filter((v) => v.key !== c.key))} className="text-zinc-400 hover:text-red-600">
                <X className="size-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-zinc-400">{kind === "interest" ? tr("Broad (no interests)", "সবাই (কোনো আগ্রহ নেই)") : "Bangladesh"}</span>
        )}
      </div>
      {!disabled && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-zinc-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "location" ? tr("Search a city or division", "শহর বা বিভাগ খোঁজো") : tr("Search an interest", "আগ্রহ খোঁজো")}
            className={inputClass + " pl-8"}
          />
          {searching && <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-zinc-400" aria-hidden />}
          {hits.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full glass-popover rounded-xl p-1">
              {hits.map((h) => (
                <li key={h.key}>
                  <button
                    type="button"
                    onClick={() => {
                      // দেশ বাছলে বাকি লোকেশন বাদ; শহর বাছলে "Bangladesh" বাদ
                      const rest = h.type === "country" ? [] : value.filter((v) => v.type !== "country");
                      if (!rest.some((v) => v.key === h.key)) onChange([...rest, h]);
                      setQ("");
                      setHits([]);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Plus className="size-3.5 text-zinc-400" aria-hidden />
                    <span className="flex-1">{h.name}</span>
                    <span className="text-[11px] text-zinc-400">{h.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type AudienceOption = { id: string; name: string; subtype: string; size: number | null };

// রিটার্গেটিং: কাদের দেখাবে আর কাদের বাদ দেবে। তৈরি বোতামে Hook-এর রিটার্গেটিং সেট থেকে বসে।
function AudiencePicker({
  audiences,
  include,
  exclude,
  setInclude,
  setExclude,
  onRetarget,
  disabled,
}: {
  audiences: AudienceOption[];
  include: string[];
  exclude: string[];
  setInclude: (v: string[]) => void;
  setExclude: (v: string[]) => void;
  onRetarget: () => void;
  disabled: boolean;
}) {
  const tr = useTr();
  const buyers = audiences.filter((a) => /Buyers|ক্রেতা|Purchase/i.test(a.name) && a.subtype !== "LOOKALIKE").map((a) => a.id);
  const hot = audiences.filter((a) => /Added to cart|Started checkout|Viewed a product|Messaged the page/i.test(a.name)).map((a) => a.id);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const label = (a: AudienceOption) => `${a.name}${a.size ? ` · ${a.size.toLocaleString("en-US")}` : ""}`;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Audiences (retargeting)", "অডিয়েন্স (রিটার্গেটিং)")}</span>
      {audiences.length === 0 ? (
        <span className="text-xs text-zinc-500">
          {tr("No audiences in this account yet. Make a retargeting set on the Audiences page.", "এই অ্যাকাউন্টে এখনো অডিয়েন্স নেই। অডিয়েন্স পাতা থেকে রিটার্গেটিং সেট বানাও।")}{" "}
          <a href="/audiences" className="text-indigo-600 underline dark:text-indigo-300">{tr("Audiences", "অডিয়েন্স")}</a>
        </span>
      ) : (
        <>
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={hot.length === 0}
                onClick={() => {
                  setInclude([...new Set([...include, ...hot])]);
                  setExclude([...new Set([...exclude, ...buyers])].filter((x) => !hot.includes(x)));
                  onRetarget();
                }}
                className={buttonClass("secondary", "text-xs")}
              >
                {tr("Retargeting: cart, checkout, viewers, messages", "রিটার্গেটিং: কার্ট, চেকআউট, ভিউ, মেসেজ")}
              </button>
              <button
                type="button"
                disabled={buyers.length === 0}
                onClick={() => setExclude([...new Set([...exclude, ...buyers])].filter((x) => !include.includes(x)))}
                className={buttonClass("secondary", "text-xs")}
              >
                {tr("New customers only (exclude buyers)", "শুধু নতুন ক্রেতা (ক্রেতাদের বাদ)")}
              </button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              [tr("Show to", "এদের দেখাও"), include, setInclude, exclude],
              [tr("Exclude", "এদের বাদ দাও"), exclude, setExclude, include],
            ] as const).map(([title, list, set, other]) => (
              <div key={title} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500">{title}</span>
                <ul className="max-h-40 overflow-y-auto rounded-lg border border-zinc-900/10 dark:border-white/10">
                  {audiences.map((a) => (
                    <li key={a.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-xs">
                        <input
                          type="checkbox"
                          disabled={disabled || other.includes(a.id)}
                          checked={list.includes(a.id)}
                          onChange={() => toggle(list, set, a.id)}
                          className="accent-indigo-600"
                        />
                        <span className="truncate">{label(a)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {include.length > 0 && (
            <span className="text-xs text-zinc-500">
              {tr("With audiences chosen, interests narrow it further; usually leave interests empty for retargeting.", "অডিয়েন্স বাছলে আগ্রহ দিলে দর্শক আরও ছোট হয়; রিটার্গেটিং-এ সাধারণত আগ্রহ খালি রাখো।")}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function ReviewForm({
  id,
  spec,
  currency,
  editable,
  audiences = [],
}: {
  id: string;
  spec: LaunchSpec;
  currency: string | null;
  editable: boolean;
  audiences?: AudienceOption[];
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<LaunchState, FormData>(saveSpec, null);
  const [locations, setLocations] = useState<Chip[]>(spec.locations);
  const [interests, setInterests] = useState<Chip[]>(spec.interests.map((i) => ({ key: i.id, name: i.name, type: "interest" })));
  const [include, setInclude] = useState<string[]>((spec.include_audiences ?? []).map((a) => a.id));
  const [exclude, setExclude] = useState<string[]>((spec.exclude_audiences ?? []).map((a) => a.id));
  // খসড়ায় থাকা অডিয়েন্স তালিকায় না থাকলেও (মুছে গেলে) নাম দেখাতে
  const known = new Map<string, string>([
    ...[...(spec.include_audiences ?? []), ...(spec.exclude_audiences ?? [])].map((a) => [a.id, a.name] as [string, string]),
    ...audiences.map((a) => [a.id, a.name] as [string, string]),
  ]);
  const audJson = (ids: string[]) => JSON.stringify(ids.map((x) => ({ id: x, name: known.get(x) ?? x })));
  const field = (label: string, child: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {child}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <input type="hidden" name="interests" value={JSON.stringify(interests.map((i) => ({ id: i.key, name: i.name })))} />
      <input type="hidden" name="include_audiences" value={audJson(include)} />
      <input type="hidden" name="exclude_audiences" value={audJson(exclude)} />
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        {field(tr("Campaign name", "ক্যাম্পেইনের নাম"), <input name="name" required maxLength={120} defaultValue={spec.name} className={inputClass} />)}
        <div className="grid gap-4 sm:grid-cols-4">
          {field(
            tr(`Daily budget (${currency ?? ""})`, `দৈনিক বাজেট (${currency ?? ""})`),
            <input name="daily_budget" inputMode="decimal" required defaultValue={spec.daily_budget} className={inputClass} />,
          )}
          {field(tr("Age from", "বয়স থেকে"), <input name="age_min" type="number" min={18} max={65} defaultValue={spec.age_min} className={inputClass} />)}
          {field(tr("Age to", "বয়স পর্যন্ত"), <input name="age_max" type="number" min={18} max={65} defaultValue={spec.age_max} className={inputClass} />, tr("65 = 65+", "৬৫ = ৬৫+"))}
          {field(
            tr("Gender", "লিঙ্গ"),
            <select name="gender" defaultValue={spec.gender} className={inputClass}>
              <option value="all">{tr("All", "সবাই")}</option>
              <option value="male">{tr("Men", "পুরুষ")}</option>
              <option value="female">{tr("Women", "নারী")}</option>
            </select>,
          )}
        </div>
        <TargetPicker kind="location" label={tr("Locations", "লোকেশন")} value={locations} onChange={setLocations} disabled={!editable} />
        <TargetPicker kind="interest" label={tr("Interests", "আগ্রহ")} value={interests} onChange={setInterests} disabled={!editable} />
        {editable ? (
          <AudiencePicker
            audiences={audiences}
            include={include}
            exclude={exclude}
            setInclude={setInclude}
            setExclude={setExclude}
            onRetarget={() => setInterests([])}
            disabled={!editable}
          />
        ) : (
          (include.length > 0 || exclude.length > 0) && (
            <p className="text-xs text-zinc-500">
              {include.length > 0 && `${tr("Shown to", "দেখানো হচ্ছে")}: ${include.map((x) => known.get(x)).join(", ")}. `}
              {exclude.length > 0 && `${tr("Excluded", "বাদ")}: ${exclude.map((x) => known.get(x)).join(", ")}.`}
            </p>
          )
        )}
        {spec.objective === "sales" &&
          field(tr("Website link", "ওয়েবসাইট লিংক"), <input name="link" type="url" required defaultValue={spec.link ?? ""} className={inputClass} />)}
        {field(
          tr("Primary text", "মূল লেখা"),
          <textarea name="primary_text" required rows={5} maxLength={2000} defaultValue={spec.primary_text} className={inputClass} />,
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(tr("Headline", "হেডলাইন"), <input name="headline" required maxLength={80} defaultValue={spec.headline} className={inputClass} />)}
          {field(tr("Description", "বিবরণ"), <input name="description" maxLength={60} defaultValue={spec.description ?? ""} className={inputClass} />)}
        </div>
        {spec.objective === "sales"
          ? field(
              tr("Button", "বাটন"),
              <select name="cta" defaultValue={spec.cta} className={inputClass}>
                {SALES_CTAS.map((c) => (
                  <option key={c} value={c}>
                    {CTA_LABELS[c] ?? c}
                  </option>
                ))}
              </select>,
            )
          : <input type="hidden" name="cta" value="MESSAGE_PAGE" />}
        {field(
          tr("Rules (optional)", "নিয়ম (ইচ্ছা হলে)"),
          <input name="rules" maxLength={500} defaultValue={spec.rules ?? ""} className={inputClass} />,
        )}
        <p className="text-xs text-zinc-500">
          {tr(`${spec.media.length} media: `, `${spec.media.length}টি মিডিয়া: `)}
          {spec.media.map((m) => m.name).join(", ")}
        </p>
      </fieldset>
      <Result state={state} />
      {editable && (
        <button type="submit" disabled={pending} className={buttonClass("secondary", "self-start")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tr("Save changes", "পরিবর্তন সংরক্ষণ")}
        </button>
      )}
    </form>
  );
}

export function LaunchButtons({ id, status, canDelete, disabled }: { id: string; status: string; canDelete: boolean; disabled: boolean }) {
  const tr = useTr();
  const [launchState, launch, launching] = useActionState<LaunchState, FormData>(launchOnMeta, null);
  const [activeState, activate, activating] = useActionState<LaunchState, FormData>(activateLaunch, null);

  return (
    <div className="flex flex-col gap-2">
      {(status === "draft" || status === "failed") && (
        <form
          action={launch}
          onSubmit={(e) => {
            if (!window.confirm(tr("Create this on Meta, turned off? Save your edits first.", "Meta-তে বন্ধ অবস্থায় তৈরি করবে? আগে বদলগুলো সংরক্ষণ করে নাও।"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={launching || disabled} className={buttonClass("primary", "w-full")}>
            {launching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
            {status === "failed" ? tr("Try again", "আবার চেষ্টা করো") : tr("Approve: make on Meta (off)", "অনুমোদন: Meta-তে তৈরি (বন্ধ)")}
          </button>
        </form>
      )}
      {(status === "waiting_video" || status === "creating") && (
        <form action={launch}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={launching || disabled} className={buttonClass("primary", "w-full")}>
            {launching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {status === "creating" ? tr("Creating…", "তৈরি হচ্ছে…") : tr("Finish", "শেষ করো")}
          </button>
        </form>
      )}
      {status === "paused" && (
        <form
          action={activate}
          onSubmit={(e) => {
            if (!window.confirm(tr("Turn this on? It will start spending once Meta approves it.", "চালু করবে? Meta অনুমোদন দিলেই খরচ শুরু হবে।"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={activating || disabled} className={buttonClass("primary", "w-full")}>
            {activating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Power className="size-4" aria-hidden />}
            {tr("Turn on", "চালু করো")}
          </button>
        </form>
      )}
      <Result state={launchState} />
      <Result state={activeState} />
      {canDelete && (
        <form
          action={deleteDraft}
          onSubmit={(e) => {
            if (!window.confirm(tr("Delete this draft?", "খসড়াটা মুছবে?"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={buttonClass("danger", "px-0 text-xs")}>
            {tr("Delete draft", "খসড়া মুছো")}
          </button>
        </form>
      )}
    </div>
  );
}
