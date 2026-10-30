"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Folder,
  Globe2,
  Heart,
  LayoutGrid,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  RectangleHorizontal,
  Send,
  Share2,
  ThumbsUp,
  Users,
} from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import {
  ATTRIBUTIONS,
  BID_STRATEGIES,
  CONVERSION_EVENTS,
  PLACEMENT_POSITIONS,
  SALES_CTAS,
  type LaunchSpec,
  type Platform,
} from "@/lib/meta/launch";
import { estimateAudience, saveSpec, type LaunchState } from "../actions";
import { AudiencePicker, CTA_LABELS, Result, TargetPicker, type AudienceOption, type Chip } from "./ReviewForm";

// Ads Manager-এর মতো সম্পাদনা: বাঁয়ে Campaign → Ad set → Ad গাছ, মাঝে সেটিং, ডানে দর্শকের আকার আর বিজ্ঞাপনের প্রিভিউ।
// সব ঘর এক ফর্মে, তাই "সংরক্ষণ" একবারেই সব রাখে।

export type MediaPreview = { path: string; kind: "image" | "video"; name: string; url: string | null; still?: boolean };
type Option = { id: string; name: string };
type Estimate = { low: number | null; high: number | null; dailyReach: [number, number] | null } | { error: string } | null;

const POSITION_LABELS: Record<string, [string, string]> = {
  feed: ["Feed", "ফিড"],
  profile_feed: ["Profile feed", "প্রোফাইল ফিড"],
  marketplace: ["Marketplace", "মার্কেটপ্লেস"],
  video_feeds: ["Video feeds", "ভিডিও ফিড"],
  right_hand_column: ["Right column", "ডান কলাম"],
  story: ["Stories", "স্টোরি"],
  facebook_reels: ["Reels", "রিলস"],
  instream_video: ["In-stream videos", "ভিডিওর ভেতরে"],
  search: ["Search results", "সার্চ ফল"],
  stream: ["Feed", "ফিড"],
  explore: ["Explore", "এক্সপ্লোর"],
  explore_home: ["Explore home", "এক্সপ্লোর হোম"],
  reels: ["Reels", "রিলস"],
  ig_search: ["Search results", "সার্চ ফল"],
  classic: ["Native, banner, interstitial", "নেটিভ, ব্যানার"],
  rewarded_video: ["Rewarded videos", "রিওয়ার্ড ভিডিও"],
};
const PLATFORM_LABELS: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network" };
const EVENT_LABELS: Record<string, [string, string]> = {
  PURCHASE: ["Purchase", "কেনা (Purchase)"],
  INITIATED_CHECKOUT: ["Initiate checkout", "চেকআউট শুরু"],
  ADD_TO_CART: ["Add to cart", "কার্টে যোগ"],
  CONTENT_VIEW: ["View content", "প্রোডাক্ট দেখা"],
  LEAD: ["Lead", "লিড"],
  COMPLETE_REGISTRATION: ["Complete registration", "রেজিস্ট্রেশন"],
};
const ATTR_LABELS: Record<string, [string, string]> = {
  "7d_click_1d_view": ["7-day click or 1-day view", "৭ দিনে ক্লিক বা ১ দিনে দেখা"],
  "7d_click": ["7-day click", "৭ দিনে ক্লিক"],
  "1d_click_1d_view": ["1-day click or 1-day view", "১ দিনে ক্লিক বা ১ দিনে দেখা"],
  "1d_click": ["1-day click", "১ দিনে ক্লিক"],
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

// এক একটা স্তর (Campaign / Ad set / Ad) আর তার ভেতরের ছোট অংশ
function Level({ id, icon: Icon, kind, title, children }: { id: string; icon: typeof Folder; kind: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="glass-panel scroll-mt-28 rounded-3xl">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{kind}</div>
          <h2 className="truncate text-base font-semibold text-zinc-50">{title}</h2>
        </div>
      </header>
      <div className="flex flex-col divide-y divide-white/[0.06]">{children}</div>
    </section>
  );
}

function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

// চালু/বন্ধ সুইচ (Advantage+ ইত্যাদি)
function Toggle({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <span>
        <span className="block text-sm font-medium text-zinc-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>}
      </span>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-indigo-500 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-400 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

// দুই-তিনটা বিকল্পের মধ্যে একটা (Ads Manager-এর রেডিও কার্ডের মতো)
function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className={cn("grid gap-2", options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer gap-2.5 rounded-2xl border px-3.5 py-3 text-sm transition-colors",
            value === o.value ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block font-medium text-zinc-100">{o.label}</span>
            {o.hint && <span className="mt-0.5 block text-xs text-zinc-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function LaunchEditor({
  id,
  spec,
  currency,
  editable,
  audiences,
  pages,
  pixels,
  media,
  aside,
}: {
  id: string;
  spec: LaunchSpec;
  currency: string | null;
  editable: boolean;
  audiences: AudienceOption[];
  pages: Option[];
  pixels: Option[];
  media: MediaPreview[];
  aside: ReactNode;
}) {
  const tr = useTr();
  const sales = spec.objective === "sales";
  const [state, action, pending] = useActionState<LaunchState, FormData>(saveSpec, null);
  const form = useRef<HTMLFormElement>(null);

  const [v, setV] = useState({
    name: spec.name,
    adset_name: spec.adset_name ?? `${spec.name} · Ad set`,
    ad_name: spec.ad_name ?? spec.name,
    budget_mode: spec.budget_mode ?? "adset",
    budget_type: spec.budget_type ?? "daily",
    daily_budget: String(spec.daily_budget),
    bid_strategy: spec.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
    bid_amount: spec.bid_amount ? String(spec.bid_amount) : "",
    start_time: spec.start_time ?? "",
    end_time: spec.end_time ?? "",
    page_id: spec.page_id,
    pixel_id: spec.pixel_id ?? "",
    conversion_event: spec.conversion_event ?? "PURCHASE",
    attribution: spec.attribution ?? "7d_click_1d_view",
    advantage_audience: spec.advantage_audience ?? false,
    age_min: String(spec.age_min),
    age_max: String(spec.age_max),
    gender: spec.gender,
    use_instagram: spec.use_instagram ?? true,
    primary_text: spec.primary_text,
    headline: spec.headline,
    description: spec.description ?? "",
    cta: spec.cta,
    link: spec.link ?? "",
    display_link: spec.display_link ?? "",
    url_tags: spec.url_tags ?? "",
    rules: spec.rules ?? "",
  });
  const set = <K extends keyof typeof v>(k: K) => (value: (typeof v)[K]) => setV((old) => ({ ...old, [k]: value }));
  const on = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));

  const [locations, setLocations] = useState<Chip[]>(spec.locations);
  const [interests, setInterests] = useState<Chip[]>(spec.interests.map((i) => ({ key: i.id, name: i.name, type: "interest" })));
  const [include, setInclude] = useState<string[]>((spec.include_audiences ?? []).map((a) => a.id));
  const [exclude, setExclude] = useState<string[]>((spec.exclude_audiences ?? []).map((a) => a.id));
  const known = new Map<string, string>([
    ...[...(spec.include_audiences ?? []), ...(spec.exclude_audiences ?? [])].map((a) => [a.id, a.name] as [string, string]),
    ...audiences.map((a) => [a.id, a.name] as [string, string]),
  ]);
  const audJson = (ids: string[]) => JSON.stringify(ids.map((x) => ({ id: x, name: known.get(x) ?? x })));

  const initialPlacements = spec.placements?.mode === "manual" ? spec.placements : null;
  const [placementMode, setPlacementMode] = useState<"auto" | "manual">(initialPlacements ? "manual" : "auto");
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlacements?.platforms ?? ["facebook", "instagram"]);
  const [positions, setPositions] = useState<Partial<Record<Platform, string[]>>>(
    initialPlacements?.positions ?? { facebook: ["feed", "story", "facebook_reels"], instagram: ["stream", "story", "reels"], messenger: ["story"], audience_network: ["classic"] },
  );
  const [devices, setDevices] = useState<("mobile" | "desktop")[]>(initialPlacements?.devices ?? ["mobile", "desktop"]);
  const flip = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  const [preview, setPreview] = useState<"feed" | "story">("feed");
  const [mediaIdx, setMediaIdx] = useState(0);
  const shown = media[Math.min(mediaIdx, media.length - 1)];
  const pageName = pages.find((p) => p.id === v.page_id)?.name ?? spec.page_name ?? "Page";

  // ফর্ম বদলালে একটু থেমে Meta থেকে দর্শকের আকার আনা
  const [estimate, setEstimate] = useState<Estimate>(null);
  const [estimating, setEstimating] = useState(false);
  const estimateKey = JSON.stringify([locations, interests, include, exclude, v.age_min, v.age_max, v.gender, v.advantage_audience, v.daily_budget, v.budget_type, v.conversion_event, v.pixel_id, placementMode, platforms, positions, devices]);
  useEffect(() => {
    if (!editable || !form.current) return;
    const t = setTimeout(async () => {
      if (!form.current) return;
      setEstimating(true);
      try {
        setEstimate((await estimateAudience(new FormData(form.current))) as Estimate);
      } finally {
        setEstimating(false);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [estimateKey, editable]);

  const budgetBlock = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Budget", "বাজেট")}>
          <select name="budget_type" value={v.budget_type} onChange={on("budget_type")} className={inputClass}>
            <option value="daily">{tr("Daily budget", "দৈনিক বাজেট")}</option>
            <option value="lifetime">{tr("Lifetime budget", "মোট বাজেট")}</option>
          </select>
        </Field>
        <Field label={tr(`Amount (${currency ?? ""})`, `পরিমাণ (${currency ?? ""})`)}>
          <input name="daily_budget" inputMode="decimal" required value={v.daily_budget} onChange={on("daily_budget")} className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Bid strategy", "বিড কৌশল")}>
          <select name="bid_strategy" value={v.bid_strategy} onChange={on("bid_strategy")} className={inputClass}>
            {BID_STRATEGIES.map((b) => (
              <option key={b} value={b}>
                {b === "LOWEST_COST_WITHOUT_CAP"
                  ? tr("Highest volume (no cap)", "সর্বোচ্চ ফল (সীমা নেই)")
                  : b === "COST_CAP"
                    ? tr("Cost per result goal (cost cap)", "ফলপ্রতি খরচের সীমা (Cost cap)")
                    : tr("Bid cap", "বিডের সীমা (Bid cap)")}
              </option>
            ))}
          </select>
        </Field>
        {v.bid_strategy !== "LOWEST_COST_WITHOUT_CAP" && (
          <Field label={tr(`Cap (${currency ?? ""})`, `সীমা (${currency ?? ""})`)} hint={tr("Too low a cap can stop delivery.", "সীমা খুব কম দিলে বিজ্ঞাপন চলতে নাও পারে।")}>
            <input name="bid_amount" inputMode="decimal" value={v.bid_amount} onChange={on("bid_amount")} className={inputClass} />
          </Field>
        )}
      </div>
    </div>
  );

  const tree = [
    { href: "#lvl-campaign", icon: Folder, label: v.name },
    { href: "#lvl-adset", icon: LayoutGrid, label: v.adset_name },
    { href: "#lvl-ad", icon: RectangleHorizontal, label: media.length > 1 ? `${v.ad_name} ×${media.length}` : v.ad_name },
  ];

  const est = estimate && !("error" in estimate) ? estimate : null;
  // সরু ↔ বড়: ১০ হাজার থেকে ১০ কোটির লগ স্কেলে
  const meter = est?.high ? Math.min(1, Math.max(0, (Math.log10(est.high) - 4) / 4)) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
    {/* ফর্মটা নিজে জায়গা নেয় না (contents), তাই তার ভেতরের অংশগুলো সরাসরি গ্রিডে বসে।
        ডানের অনুমোদন বোতামগুলোর নিজস্ব ফর্ম আছে, তাই সেগুলো এই ফর্মের বাইরে। */}
    <form ref={form} action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <input type="hidden" name="interests" value={JSON.stringify(interests.map((i) => ({ id: i.key, name: i.name })))} />
      <input type="hidden" name="include_audiences" value={audJson(include)} />
      <input type="hidden" name="exclude_audiences" value={audJson(exclude)} />
      <input type="hidden" name="page_name" value={pageName} />
      <input type="hidden" name="placement_mode" value={placementMode} />

      {/* বাঁয়ে Ads Manager-এর মতো স্তরের গাছ */}
      <nav aria-label={tr("Levels", "স্তর")} className="hidden xl:block">
        <ol className="glass-panel sticky top-28 flex flex-col gap-0.5 rounded-3xl p-2 text-sm">
          {tree.map((t, i) => (
            <li key={t.href} style={{ paddingLeft: i * 14 }}>
              <a href={t.href} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-zinc-300 hover:bg-white/[0.07] hover:text-white">
                <t.icon className="size-4 shrink-0 text-indigo-300" aria-hidden />
                <span className="truncate">{t.label || "—"}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-5">
        {/* ---------- Campaign ---------- */}
        <Level id="lvl-campaign" icon={Folder} kind={tr("Campaign", "ক্যাম্পেইন")} title={v.name || "—"}>
          <Part title={tr("Campaign details", "ক্যাম্পেইনের তথ্য")}>
            <Field label={tr("Campaign name", "ক্যাম্পেইনের নাম")}>
              <input name="name" required maxLength={120} value={v.name} onChange={on("name")} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("Buying type", "কেনার ধরন")}>
                <input value={tr("Auction", "নিলাম (Auction)")} readOnly className={cn(inputClass, "opacity-70")} />
              </Field>
              <Field label={tr("Campaign objective", "ক্যাম্পেইনের লক্ষ্য")}>
                <input value={sales ? tr("Sales", "বিক্রি (Sales)") : tr("Engagement (messages)", "এনগেজমেন্ট (মেসেজ)")} readOnly className={cn(inputClass, "opacity-70")} />
              </Field>
            </div>
          </Part>
          <Part title={tr("Budget", "বাজেট")} hint={tr("Choose where the budget lives, like in Ads Manager.", "Ads Manager-এর মতো বাজেট কোথায় থাকবে বাছো।")}>
            <Toggle
              name="budget_mode_toggle"
              checked={v.budget_mode === "campaign"}
              onChange={(c) => set("budget_mode")(c ? "campaign" : "adset")}
              label={tr("Advantage+ campaign budget", "Advantage+ ক্যাম্পেইন বাজেট")}
              hint={tr("Budget is set on the campaign and Meta spreads it across ad sets.", "বাজেট ক্যাম্পেইনে থাকে, Meta নিজে Ad Set-গুলোতে ভাগ করে।")}
            />
            <input type="hidden" name="budget_mode" value={v.budget_mode} />
            {v.budget_mode === "campaign" && budgetBlock}
          </Part>
        </Level>

        {/* ---------- Ad set ---------- */}
        <Level id="lvl-adset" icon={LayoutGrid} kind={tr("Ad set", "Ad Set")} title={v.adset_name || "—"}>
          <Part title={tr("Ad set name", "Ad Set-এর নাম")}>
            <input name="adset_name" maxLength={120} value={v.adset_name} onChange={on("adset_name")} className={inputClass} aria-label={tr("Ad set name", "Ad Set-এর নাম")} />
          </Part>

          <Part title={tr("Conversion", "কনভার্সন")}>
            {sales ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={tr("Conversion location", "কনভার্সন কোথায়")}>
                    <input value={tr("Website", "ওয়েবসাইট")} readOnly className={cn(inputClass, "opacity-70")} />
                  </Field>
                  <Field label={tr("Performance goal", "পারফরম্যান্স লক্ষ্য")}>
                    <input value={tr("Maximise number of conversions", "সবচেয়ে বেশি কনভার্সন")} readOnly className={cn(inputClass, "opacity-70")} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Pixel">
                    <select name="pixel_id" value={v.pixel_id} onChange={on("pixel_id")} className={inputClass}>
                      {!pixels.some((p) => p.id === v.pixel_id) && v.pixel_id && <option value={v.pixel_id}>{v.pixel_id}</option>}
                      {pixels.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={tr("Conversion event", "কনভার্সন ইভেন্ট")}>
                    <select name="conversion_event" value={v.conversion_event} onChange={on("conversion_event")} className={inputClass}>
                      {CONVERSION_EVENTS.map((e) => (
                        <option key={e} value={e}>
                          {tr(EVENT_LABELS[e][0], EVENT_LABELS[e][1])}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr("Conversion location", "কনভার্সন কোথায়")}>
                  <input value="Messenger" readOnly className={cn(inputClass, "opacity-70")} />
                </Field>
                <Field label={tr("Performance goal", "পারফরম্যান্স লক্ষ্য")}>
                  <input value={tr("Maximise number of conversations", "সবচেয়ে বেশি কথোপকথন")} readOnly className={cn(inputClass, "opacity-70")} />
                </Field>
              </div>
            )}
          </Part>

          <Part title={tr("Budget & schedule", "বাজেট ও সময়সূচি")}>
            {v.budget_mode === "adset" ? (
              budgetBlock
            ) : (
              <p className="text-xs text-zinc-500">{tr("Budget is on the campaign (Advantage+ campaign budget).", "বাজেট ক্যাম্পেইনে আছে (Advantage+ ক্যাম্পেইন বাজেট)।")}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("Start (Dhaka time)", "শুরু (ঢাকার সময়)")} hint={tr("Empty = as soon as it's turned on.", "খালি = চালু করার সাথে সাথে।")}>
                <input name="start_time" type="datetime-local" value={v.start_time} onChange={on("start_time")} className={inputClass} />
              </Field>
              <Field
                label={tr("End (optional)", "শেষ (ইচ্ছা হলে)")}
                hint={v.budget_type === "lifetime" ? tr("Needed for a lifetime budget.", "মোট বাজেটে লাগবে।") : tr("Empty = runs until you stop it.", "খালি = বন্ধ না করা পর্যন্ত চলবে।")}
              >
                <input name="end_time" type="datetime-local" value={v.end_time} onChange={on("end_time")} required={v.budget_type === "lifetime"} className={inputClass} />
              </Field>
            </div>
          </Part>

          <Part title={tr("Audience", "অডিয়েন্স")} hint={tr("Who should see your ads.", "কারা বিজ্ঞাপন দেখবে।")}>
            <Toggle
              name="advantage_audience"
              checked={v.advantage_audience}
              onChange={set("advantage_audience")}
              label={tr("Advantage+ audience", "Advantage+ অডিয়েন্স")}
              hint={
                v.advantage_audience
                  ? tr("On: your age, gender and interests become suggestions; Meta may reach beyond them (age 25–65+).", "চালু: বয়স, লিঙ্গ আর আগ্রহ শুধু পরামর্শ; Meta এর বাইরেও দেখাতে পারে (বয়স ২৫–৬৫+)।")
                  : tr("Off: Meta sticks to the audience below.", "বন্ধ: Meta শুধু নিচের অডিয়েন্সেই দেখাবে।")
              }
            />
            <TargetPicker kind="location" label={tr("Locations", "লোকেশন")} value={locations} onChange={setLocations} disabled={!editable} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={tr("Age from", "বয়স থেকে")}>
                <input name="age_min" type="number" min={18} max={65} value={v.age_min} onChange={on("age_min")} className={inputClass} />
              </Field>
              <Field label={tr("Age to", "বয়স পর্যন্ত")} hint={tr("65 = 65+", "৬৫ = ৬৫+")}>
                <input name="age_max" type="number" min={18} max={65} value={v.age_max} onChange={on("age_max")} className={inputClass} />
              </Field>
              <Field label={tr("Gender", "লিঙ্গ")}>
                <select name="gender" value={v.gender} onChange={on("gender")} className={inputClass}>
                  <option value="all">{tr("All", "সবাই")}</option>
                  <option value="male">{tr("Men", "পুরুষ")}</option>
                  <option value="female">{tr("Women", "নারী")}</option>
                </select>
              </Field>
            </div>
            <TargetPicker kind="interest" label={tr("Detailed targeting (interests)", "বিস্তারিত টার্গেটিং (আগ্রহ)")} value={interests} onChange={setInterests} disabled={!editable} />
            {editable ? (
              <AudiencePicker audiences={audiences} include={include} exclude={exclude} setInclude={setInclude} setExclude={setExclude} onRetarget={() => setInterests([])} disabled={!editable} />
            ) : (
              (include.length > 0 || exclude.length > 0) && (
                <p className="text-xs text-zinc-500">
                  {include.length > 0 && `${tr("Shown to", "দেখানো হচ্ছে")}: ${include.map((x) => known.get(x)).join(", ")}. `}
                  {exclude.length > 0 && `${tr("Excluded", "বাদ")}: ${exclude.map((x) => known.get(x)).join(", ")}.`}
                </p>
              )
            )}
          </Part>

          <Part title={tr("Placements", "প্লেসমেন্ট")} hint={tr("Where the ads show.", "বিজ্ঞাপন কোথায় দেখাবে।")}>
            <Choice
              name="placement_choice"
              value={placementMode}
              onChange={setPlacementMode}
              options={[
                { value: "auto", label: tr("Advantage+ placements", "Advantage+ প্লেসমেন্ট"), hint: tr("Recommended: Meta shows ads where they work best.", "পরামর্শ: যেখানে ভালো চলে Meta সেখানে দেখায়।") },
                { value: "manual", label: tr("Manual placements", "নিজে বাছাই"), hint: tr("Pick platforms and spots yourself.", "প্ল্যাটফর্ম আর জায়গা নিজে বাছো।") },
              ]}
            />
            {placementMode === "manual" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="font-medium text-zinc-300">{tr("Devices", "ডিভাইস")}:</span>
                  {(["mobile", "desktop"] as const).map((d) => (
                    <label key={d} className="flex items-center gap-1.5">
                      <input type="checkbox" name="devices" value={d} checked={devices.includes(d)} onChange={() => setDevices(flip(devices, d))} className="accent-indigo-500" />
                      {d === "mobile" ? tr("Mobile", "মোবাইল") : tr("Desktop", "ডেস্কটপ")}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(PLACEMENT_POSITIONS) as Platform[]).map((pl) => (
                    <div key={pl} className={cn("rounded-2xl border px-4 py-3", platforms.includes(pl) ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.06] opacity-70")}>
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <input type="checkbox" name="platforms" value={pl} checked={platforms.includes(pl)} onChange={() => setPlatforms(flip(platforms, pl))} className="accent-indigo-500" />
                        {PLATFORM_LABELS[pl]}
                      </label>
                      {platforms.includes(pl) && (
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 pl-6 text-xs">
                          {PLACEMENT_POSITIONS[pl].map((pos) => (
                            <label key={pos} className="flex items-center gap-1.5 text-zinc-300">
                              <input
                                type="checkbox"
                                name={`pos_${pl}`}
                                value={pos}
                                checked={positions[pl]?.includes(pos) ?? false}
                                onChange={() => setPositions({ ...positions, [pl]: flip(positions[pl] ?? [], pos) })}
                                className="accent-indigo-500"
                              />
                              {tr(...(POSITION_LABELS[pos] ?? [pos, pos]))}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Part>

          {sales && (
            <Part title={tr("Attribution setting", "অ্যাট্রিবিউশন")} hint={tr("Which conversions count for this ad.", "কোন কনভার্সন এই বিজ্ঞাপনের ধরা হবে।")}>
              <select name="attribution" value={v.attribution} onChange={on("attribution")} className={inputClass} aria-label={tr("Attribution setting", "অ্যাট্রিবিউশন")}>
                {Object.keys(ATTRIBUTIONS).map((a) => (
                  <option key={a} value={a}>
                    {tr(...ATTR_LABELS[a])}
                  </option>
                ))}
              </select>
            </Part>
          )}
        </Level>

        {/* ---------- Ad ---------- */}
        <Level id="lvl-ad" icon={RectangleHorizontal} kind={tr("Ad", "বিজ্ঞাপন")} title={v.ad_name || "—"}>
          <Part title={tr("Ad name", "বিজ্ঞাপনের নাম")} hint={media.length > 1 ? tr(`One ad per media (${media.length}); the file name is added.`, `প্রতিটা মিডিয়ায় একটা করে বিজ্ঞাপন (${media.length}টি); শেষে ফাইলের নাম বসে।`) : undefined}>
            <input name="ad_name" maxLength={120} value={v.ad_name} onChange={on("ad_name")} className={inputClass} aria-label={tr("Ad name", "বিজ্ঞাপনের নাম")} />
          </Part>

          <Part title={tr("Identity", "পরিচয়")}>
            <Field label={tr("Facebook Page", "Facebook পেজ")}>
              <select name="page_id" value={v.page_id} onChange={on("page_id")} className={inputClass}>
                {!pages.some((p) => p.id === v.page_id) && <option value={v.page_id}>{spec.page_name ?? v.page_id}</option>}
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle
              name="use_instagram"
              checked={v.use_instagram}
              onChange={set("use_instagram")}
              label={tr("Use the Page's Instagram account", "পেজের Instagram অ্যাকাউন্ট ব্যবহার")}
              hint={tr("If the page has a linked Instagram, ads show from it there.", "পেজের সাথে Instagram যুক্ত থাকলে সেখানে সেই নামে দেখাবে।")}
            />
          </Part>

          <Part title={tr("Ad setup", "বিজ্ঞাপনের ধরন")} hint={tr("Single image or video, from the files you uploaded.", "আপলোড করা ফাইল থেকে একক ছবি বা ভিডিও।")}>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {media.map((m, i) => (
                <button
                  key={m.path}
                  type="button"
                  onClick={() => setMediaIdx(i)}
                  className={cn("relative size-20 shrink-0 overflow-hidden rounded-xl border", i === mediaIdx ? "border-indigo-400" : "border-white/10")}
                  aria-label={m.name}
                  title={m.name}
                >
                  {m.url && (m.kind === "image" || m.still) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="size-full object-cover" />
                  ) : m.url ? (
                    <video src={m.url} muted playsInline preload="metadata" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[10px] text-zinc-500">{m.kind}</span>
                  )}
                  <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[9px] text-white uppercase">{m.kind}</span>
                </button>
              ))}
            </div>
          </Part>

          <Part title={tr("Ad creative", "বিজ্ঞাপনের লেখা")}>
            <Field label={tr("Primary text", "মূল লেখা")} hint={`${v.primary_text.length}/2000`}>
              <textarea name="primary_text" required rows={6} maxLength={2000} value={v.primary_text} onChange={on("primary_text")} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("Headline", "হেডলাইন")} hint={`${v.headline.length}/80`}>
                <input name="headline" required maxLength={80} value={v.headline} onChange={on("headline")} className={inputClass} />
              </Field>
              <Field label={tr("Description", "বিবরণ")} hint={`${v.description.length}/60`}>
                <input name="description" maxLength={60} value={v.description} onChange={on("description")} className={inputClass} />
              </Field>
            </div>
            {sales ? (
              <Field label={tr("Call to action", "বাটন")}>
                <select name="cta" value={v.cta} onChange={on("cta")} className={inputClass}>
                  {SALES_CTAS.map((c) => (
                    <option key={c} value={c}>
                      {CTA_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="cta" value="MESSAGE_PAGE" />
            )}
          </Part>

          {sales && (
            <Part title={tr("Destination", "গন্তব্য")}>
              <Field label={tr("Website URL", "ওয়েবসাইট লিংক")}>
                <input name="link" type="url" required value={v.link} onChange={on("link")} className={inputClass} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr("Display link (optional)", "দেখানো লিংক (ইচ্ছা হলে)")} hint={tr("e.g. formalmenbd.com", "যেমন formalmenbd.com")}>
                  <input name="display_link" maxLength={80} value={v.display_link} onChange={on("display_link")} className={inputClass} />
                </Field>
                <Field label={tr("URL parameters", "URL প্যারামিটার")} hint={tr("Empty = Hook's UTM tags (orders match campaigns).", "খালি = Hook-এর UTM (অর্ডার ক্যাম্পেইনের সাথে মেলে)।")}>
                  <input name="url_tags" maxLength={500} value={v.url_tags} onChange={on("url_tags")} placeholder="utm_source=facebook&…" className={inputClass} />
                </Field>
              </div>
            </Part>
          )}

          <Part title={tr("Rules (optional)", "নিয়ম (ইচ্ছা হলে)")}>
            <input name="rules" maxLength={500} value={v.rules} onChange={on("rules")} className={inputClass} aria-label={tr("Rules", "নিয়ম")} />
          </Part>
        </Level>

        <div className="flex flex-wrap items-center gap-3">
          {editable && (
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {tr("Save changes", "পরিবর্তন সংরক্ষণ")}
            </button>
          )}
          <Result state={state} />
        </div>
      </fieldset>
    </form>

      {/* ডানে: অনুমোদন, দর্শকের আকার, প্রিভিউ */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
        {aside}
        {editable && (
          <section className="glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Users className="size-4 text-indigo-300" aria-hidden />
                {tr("Audience definition", "অডিয়েন্সের আকার")}
              </h2>
              {estimating && <Loader2 className="size-4 animate-spin text-zinc-400" aria-hidden />}
            </div>
            <div className="mt-4">
              <div className="relative h-2 rounded-full bg-gradient-to-r from-amber-400/70 via-emerald-400/70 to-amber-400/70">
                {meter !== null && (
                  <span className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-black shadow" style={{ left: `${meter * 100}%` }} />
                )}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
                <span>{tr("Specific", "সরু")}</span>
                <span>{tr("Broad", "বড়")}</span>
              </div>
            </div>
            {estimate && "error" in estimate ? (
              <p className="mt-3 text-xs text-amber-300">{estimate.error}</p>
            ) : est ? (
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">{tr("Estimated audience size", "আনুমানিক দর্শক")}</dt>
                  <dd className="font-semibold text-zinc-50">{est.low && est.high ? `${compact(est.low)} – ${compact(est.high)}` : "—"}</dd>
                </div>
                {est.dailyReach && (
                  <div>
                    <dt className="text-xs text-zinc-500">{tr("Estimated daily reach", "দিনে আনুমানিক reach")}</dt>
                    <dd className="font-semibold text-zinc-50">
                      {compact(est.dailyReach[0])} – {compact(est.dailyReach[1])}
                    </dd>
                  </div>
                )}
                <p className="text-[11px] text-zinc-500">{tr("Meta's estimate; real results vary.", "Meta-র আন্দাজ; আসল ফল আলাদা হতে পারে।")}</p>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">{tr("Calculating…", "হিসাব হচ্ছে…")}</p>
            )}
          </section>
        )}

        <section className="glass-panel rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">{tr("Ad preview", "বিজ্ঞাপনের প্রিভিউ")}</h2>
            <div className="flex rounded-full bg-white/[0.06] p-0.5 text-xs">
              {(["feed", "story"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preview === p}
                  onClick={() => setPreview(p)}
                  className={cn("rounded-full px-2.5 py-1", preview === p ? "glass-chip text-white" : "text-zinc-400")}
                >
                  {p === "feed" ? tr("Feed", "ফিড") : tr("Story", "স্টোরি")}
                </button>
              ))}
            </div>
          </div>

          {preview === "feed" ? (
            <div className="overflow-hidden rounded-2xl bg-white text-[13px] text-[#1c1e21] shadow-lg">
              <div className="flex items-center gap-2 px-3 pt-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{pageName.slice(0, 1)}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-semibold">{pageName}</div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                    {tr("Sponsored", "স্পনসরড")} · <Globe2 className="size-3" aria-hidden />
                  </div>
                </div>
                <MoreHorizontal className="size-4 text-zinc-500" aria-hidden />
              </div>
              <p className="line-clamp-4 px-3 py-2 whitespace-pre-line">{v.primary_text}</p>
              <div className="aspect-square bg-zinc-200">
                {shown?.url && (shown.kind === "image" || shown.still) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shown.url} alt="" className="size-full object-cover" />
                ) : shown?.url ? (
                  <video src={shown.url} muted playsInline autoPlay loop className="size-full object-cover" />
                ) : null}
              </div>
              <div className="flex items-center gap-3 bg-zinc-100 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  {sales && <div className="truncate text-[11px] text-zinc-500 uppercase">{v.display_link || hostOf(v.link)}</div>}
                  <div className="truncate font-semibold">{v.headline}</div>
                  {v.description && <div className="truncate text-xs text-zinc-500">{v.description}</div>}
                </div>
                <span className="shrink-0 rounded-md bg-zinc-200 px-3 py-1.5 text-xs font-semibold">
                  {sales ? CTA_LABELS[v.cta] ?? v.cta : tr("Send message", "মেসেজ পাঠাও")}
                </span>
              </div>
              <div className="flex justify-around border-t border-zinc-200 py-2 text-xs text-zinc-600">
                <span className="flex items-center gap-1"><ThumbsUp className="size-3.5" aria-hidden /> Like</span>
                <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden /> Comment</span>
                <span className="flex items-center gap-1"><Share2 className="size-3.5" aria-hidden /> Share</span>
              </div>
            </div>
          ) : (
            <div className="relative mx-auto aspect-[9/16] w-56 overflow-hidden rounded-2xl bg-black text-white shadow-lg">
              {shown?.url && (shown.kind === "image" || shown.still) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown.url} alt="" className="absolute inset-0 size-full object-cover" />
              ) : shown?.url ? (
                <video src={shown.url} muted playsInline autoPlay loop className="absolute inset-0 size-full object-cover" />
              ) : null}
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3">
                <div className="mb-2 h-0.5 rounded-full bg-white/70" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex size-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold">{pageName.slice(0, 1)}</span>
                  <span className="font-semibold">{pageName}</span>
                  <span className="text-white/70">{tr("Sponsored", "স্পনসরড")}</span>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
                <p className="line-clamp-2 text-center text-[11px]">{v.primary_text}</p>
                <span className="flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#1c1e21]">
                  {sales ? CTA_LABELS[v.cta] ?? v.cta : tr("Send message", "মেসেজ পাঠাও")}
                  {!sales && <Send className="size-3" aria-hidden />}
                </span>
              </div>
            </div>
          )}
          {media.length > 1 && (
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              <Heart className="mr-1 inline size-3" aria-hidden />
              {tr(`Ad ${mediaIdx + 1} of ${media.length}: pick another file in "Ad setup".`, `${media.length}টার মধ্যে ${mediaIdx + 1} নম্বর বিজ্ঞাপন; "বিজ্ঞাপনের ধরন" থেকে অন্যটা বাছো।`)}
            </p>
          )}
        </section>

      </aside>
    </div>
  );
}

function hostOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
