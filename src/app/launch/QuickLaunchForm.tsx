"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { FolderOpen, History, Loader2, Rocket, Sparkles } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { SALES_CTAS } from "@/lib/meta/launch";
import type { SourceAd } from "@/lib/meta/launchSources";
import { CTA_LABELS, TargetPicker, type Chip } from "./[id]/ReviewForm";
import { aiWriteCopy, createQuickDraft, launchCampaignAds, launchCampaigns, type LaunchState } from "./actions";

// AI ছাড়া নতুন বিজ্ঞাপন: কনটেন্ট (Drive লিংক বা আগের ক্যাম্পেইন) + সেটিং + নিয়ম → খসড়া → দেখে অনুমোদন

export type QuickDefaults = {
  objective?: "sales" | "messages";
  page_id?: string;
  pixel_id?: string;
  link?: string | null;
  daily_budget?: number;
  age_min?: number;
  age_max?: number;
  gender?: "all" | "male" | "female";
  locations?: Chip[];
  interests?: { id: string; name: string }[];
  new_customers?: boolean;
  cta?: string;
  target?: number | null;
};

const RULES: [string, string, string, boolean][] = [
  ["stop_expensive", "Turn off when cost per result is over 2× target", "খরচ টার্গেটের দ্বিগুণ হলে বন্ধ", true],
  ["stop_no_results", "Turn off when spending 3× target with no results", "টার্গেটের ৩ গুণ খরচে রেজাল্ট না এলে বন্ধ", true],
  ["scale_winners", "Raise budget +20% when cost is under 80% of target", "খরচ টার্গেটের ৮০%-এর নিচে হলে বাজেট +২০%", false],
  ["low_ctr", "Alert when CTR is weak (new creative needed)", "CTR কম হলে জানাও (নতুন ক্রিয়েটিভ দরকার)", false],
  ["low_delivery", "Alert when delivery rate drops below 60%", "ডেলিভারি রেট ৬০%-এর নিচে নামলে জানাও", false],
];

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-white/[0.07] pb-6 last:border-0 last:pb-0">
      <h3 className="flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
        <span className="flex size-6 items-center justify-center rounded-full bg-indigo-500/20 text-xs text-indigo-200">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-zinc-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function Pick<T extends string>({ name, value, onChange, options }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div className={cn("grid gap-2", options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm",
            value === o.value ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block font-medium text-zinc-100">{o.label}</span>
            {o.hint && <span className="block text-xs text-zinc-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function QuickLaunchForm({
  pages,
  pixels,
  audiences,
  currency,
  defaults = {},
}: {
  pages: { id: string; name: string }[];
  pixels: { id: string; name: string; active: boolean }[];
  audiences: { id: string; name: string; size: number | null }[];
  currency: string | null;
  defaults?: QuickDefaults;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<LaunchState, FormData>(createQuickDraft, null);
  const [source, setSource] = useState<"drive" | "campaign">("drive");
  const [objective, setObjective] = useState(defaults.objective ?? "sales");
  const [pageId, setPageId] = useState(pages.some((p) => p.id === defaults.page_id) ? defaults.page_id! : (pages[0]?.id ?? ""));
  const [audience, setAudience] = useState<"broad" | "new" | "retarget">(defaults.new_customers ? "new" : "broad");
  const [include, setInclude] = useState<string[]>([]);
  const [locations, setLocations] = useState<Chip[]>(defaults.locations ?? []);
  const [interests, setInterests] = useState<Chip[]>((defaults.interests ?? []).map((i) => ({ key: i.id, name: i.name, type: "interest" })));
  const [copy, setCopy] = useState({ primary_text: "", headline: "", description: "" });
  const [link, setLink] = useState(defaults.link ?? "");

  // আগের ক্যাম্পেইন
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; active: boolean }[] | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [ads, setAds] = useState<SourceAd[] | null>(null);
  const [adIds, setAdIds] = useState<string[]>([]);
  const [reuse, setReuse] = useState<"post" | "media">("post");
  const [loading, startLoad] = useTransition();
  const [adsError, setAdsError] = useState<string | null>(null);

  // AI দিয়ে লেখা
  const [notes, setNotes] = useState("");
  const [writing, startWrite] = useTransition();
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    if (source === "campaign" && campaigns === null) startLoad(async () => setCampaigns(await launchCampaigns()));
  }, [source, campaigns]);

  const loadAds = (id: string) => {
    setCampaignId(id);
    setAds(null);
    setAdIds([]);
    setAdsError(null);
    if (!id) return;
    startLoad(async () => {
      const r = await launchCampaignAds(id);
      if ("error" in r) return setAdsError(r.error);
      setAds(r);
      setAdIds(r.filter((a) => a.status === "ACTIVE").map((a) => a.id).slice(0, 5));
      const first = r[0];
      if (first) {
        setCopy({ primary_text: first.body ?? "", headline: first.title ?? "", description: first.description ?? "" });
        if (first.link && !link) setLink(first.link);
      }
    });
  };

  const usesPost = source === "campaign" && reuse === "post";
  const pageName = pages.find((p) => p.id === pageId)?.name ?? "";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="page_name" value={pageName} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <input type="hidden" name="interests" value={JSON.stringify(interests.map((i) => ({ id: i.key, name: i.name })))} />
      <input type="hidden" name="include_audiences" value={JSON.stringify(include.map((id) => ({ id, name: audiences.find((a) => a.id === id)?.name ?? id })))} />

      <Step n={1} title={tr("Content", "কনটেন্ট")}>
        <Pick
          name="source_pick"
          value={source}
          onChange={setSource}
          options={[
            { value: "drive", label: tr("Google Drive link", "Google Drive লিংক"), hint: tr("Videos or images shared with 'Anyone with the link'", "'Anyone with the link' করে শেয়ার করা ভিডিও বা ছবি") },
            { value: "campaign", label: tr("From an old campaign", "আগের ক্যাম্পেইন থেকে"), hint: tr("Reuse its post, or its video with new text", "তার পোস্ট, বা ভিডিও নতুন লেখার সাথে") },
          ]}
        />
        {source === "drive" ? (
          <Field label={tr("Drive file links (one per line, up to 5; each becomes an ad)", "Drive ফাইলের লিংক (প্রতি লাইনে একটা, সর্বোচ্চ ৫টা; প্রতিটা আলাদা বিজ্ঞাপন)")}>
            <textarea name="drive_links" rows={3} placeholder="https://drive.google.com/file/d/…/view" className={inputClass} />
          </Field>
        ) : (
          <div className="flex flex-col gap-3">
            <input type="hidden" name="campaign_id" value={campaignId} />
            <Field label={tr("Campaign", "ক্যাম্পেইন")}>
              <select value={campaignId} onChange={(e) => loadAds(e.target.value)} className={inputClass}>
                <option value="">{campaigns === null ? tr("Loading…", "আসছে…") : tr("Pick a campaign", "ক্যাম্পেইন বাছো")}</option>
                {(campaigns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.active ? "" : tr("(off)", "(বন্ধ)")}
                  </option>
                ))}
              </select>
            </Field>
            {loading && <Loader2 className="size-4 animate-spin text-zinc-400" aria-hidden />}
            {adsError && <p className="text-sm text-red-400">{adsError}</p>}
            {ads && (
              <>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ads.map((a) => (
                    <li key={a.id}>
                      <label className={cn("flex cursor-pointer gap-3 rounded-2xl border p-2.5 text-sm", adIds.includes(a.id) ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/[0.08] bg-white/[0.03]")}>
                        <input
                          type="checkbox"
                          name="ad_ids"
                          value={a.id}
                          checked={adIds.includes(a.id)}
                          onChange={() => setAdIds(adIds.includes(a.id) ? adIds.filter((x) => x !== a.id) : [...adIds, a.id].slice(0, 5))}
                          className="mt-1 accent-indigo-500"
                        />
                        {a.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.thumb} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="size-14 shrink-0 rounded-lg bg-white/5" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-zinc-100">{a.name}</span>
                          <span className="block text-[11px] text-zinc-500">
                            {a.status === "ACTIVE" ? tr("Active", "চালু") : tr("Off", "বন্ধ")} · {a.video_id ? tr("video", "ভিডিও") : a.image_hash ? tr("image", "ছবি") : "—"}
                          </span>
                          <span className="line-clamp-2 text-[11px] text-zinc-400">{a.body}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {ads.length === 0 && <li className="text-sm text-zinc-500">{tr("No ads in this campaign.", "এই ক্যাম্পেইনে কোনো বিজ্ঞাপন নেই।")}</li>}
                </ul>
                <Pick
                  name="reuse"
                  value={reuse}
                  onChange={setReuse}
                  options={[
                    { value: "post", label: tr("Same post", "একই পোস্ট"), hint: tr("Keeps its likes, comments and shares; text can't change", "লাইক, কমেন্ট, শেয়ার থেকে যায়; লেখা বদলানো যায় না") },
                    { value: "media", label: tr("Its video/image, new text", "তার ভিডিও/ছবি, নতুন লেখা"), hint: tr("Write or keep the text below", "নিচে লেখা দাও বা আগেরটা রাখো") },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Step>

      <Step n={2} title={tr("Goal and page", "লক্ষ্য আর পেজ")}>
        <Pick
          name="objective"
          value={objective}
          onChange={setObjective}
          options={[
            { value: "sales", label: tr("Website sales", "ওয়েবসাইটে বিক্রি") },
            { value: "messages", label: tr("Messenger messages", "Messenger মেসেজ") },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("Facebook page", "Facebook পেজ")}>
            <select name="page_id" value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputClass}>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {objective === "sales" && (
            <Field label="Pixel">
              <select name="pixel_id" defaultValue={pixels.some((p) => p.id === defaults.pixel_id) ? defaults.pixel_id : (pixels.find((p) => p.active)?.id ?? pixels[0]?.id)} className={inputClass}>
                {pixels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? ` (${tr("no activity", "কাজ করছে না")})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {objective === "sales" && !usesPost && (
          <Field label={tr("Website link (product page)", "ওয়েবসাইট লিংক (প্রোডাক্ট পেজ)")}>
            <input name="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={inputClass} />
          </Field>
        )}
      </Step>

      <Step n={3} title={tr("Budget and audience", "বাজেট আর অডিয়েন্স")}>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={tr(`Daily budget (${currency ?? ""})`, `দৈনিক বাজেট (${currency ?? ""})`)}>
            <input name="daily_budget" inputMode="decimal" required defaultValue={defaults.daily_budget ?? (currency === "BDT" ? 1000 : 10)} className={inputClass} />
          </Field>
          <Field label={tr("Age from", "বয়স থেকে")}>
            <input name="age_min" type="number" min={18} max={65} defaultValue={defaults.age_min ?? 18} className={inputClass} />
          </Field>
          <Field label={tr("Age to", "বয়স পর্যন্ত")} hint={tr("65 = 65+", "৬৫ = ৬৫+")}>
            <input name="age_max" type="number" min={18} max={65} defaultValue={defaults.age_max ?? 55} className={inputClass} />
          </Field>
          <Field label={tr("Gender", "লিঙ্গ")}>
            <select name="gender" defaultValue={defaults.gender ?? "all"} className={inputClass}>
              <option value="all">{tr("All", "সবাই")}</option>
              <option value="male">{tr("Men", "পুরুষ")}</option>
              <option value="female">{tr("Women", "নারী")}</option>
            </select>
          </Field>
        </div>
        <TargetPicker kind="location" label={tr("Locations", "লোকেশন")} value={locations} onChange={setLocations} disabled={false} />
        <Pick
          name="audience"
          value={audience}
          onChange={setAudience}
          options={[
            { value: "broad", label: tr("Everyone", "সবাই"), hint: tr("Location, age and interests only", "শুধু লোকেশন, বয়স আর আগ্রহ") },
            { value: "new", label: tr("New customers", "নতুন ক্রেতা"), hint: tr("Past buyers left out", "আগের ক্রেতারা বাদ") },
            { value: "retarget", label: tr("Retarget", "রিটার্গেট"), hint: tr("People in your audiences", "তোমার অডিয়েন্সের মানুষ") },
          ]}
        />
        {audience === "retarget" ? (
          <ul className="max-h-48 overflow-y-auto rounded-2xl border border-white/[0.08]">
            {audiences.map((a) => (
              <li key={a.id} className="border-b border-white/[0.05] last:border-0">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs">
                  <input type="checkbox" checked={include.includes(a.id)} onChange={() => setInclude(include.includes(a.id) ? include.filter((x) => x !== a.id) : [...include, a.id])} className="accent-indigo-500" />
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{a.name}</span>
                  {a.size && <span className="text-zinc-500">{a.size.toLocaleString("en-US")}</span>}
                </label>
              </li>
            ))}
            {audiences.length === 0 && <li className="px-3 py-3 text-xs text-zinc-500">{tr("No audiences yet; make them on the Audiences page.", "এখনো অডিয়েন্স নেই; অডিয়েন্স পাতা থেকে বানাও।")}</li>}
          </ul>
        ) : (
          <TargetPicker kind="interest" label={tr("Interests (optional)", "আগ্রহ (ইচ্ছা হলে)")} value={interests} onChange={setInterests} disabled={false} />
        )}
      </Step>

      <Step n={4} title={tr("Ad text", "বিজ্ঞাপনের লেখা")}>
        {usesPost ? (
          <p className="text-sm text-zinc-400">{tr("The old post is used as it is, with its own text.", "আগের পোস্টটা তার নিজের লেখাসহ যেমন আছে তেমন ব্যবহার হবে।")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Notes for the AI (product, price, offer)…", "AI-এর জন্য তথ্য (প্রোডাক্ট, দাম, অফার)…")} className={cn(inputClass, "min-w-0 flex-1")} />
                <button
                  type="button"
                  disabled={writing}
                  onClick={() =>
                    startWrite(async () => {
                      setWriteError(null);
                      const r = await aiWriteCopy({ link, notes, objective });
                      if ("error" in r) setWriteError(r.error);
                      else setCopy(r);
                    })
                  }
                  className={buttonClass("secondary", "shrink-0")}
                >
                  {writing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                  {tr("Write with AI", "AI দিয়ে লেখাও")}
                </button>
              </div>
              <span className="text-xs text-zinc-500">{tr("Optional. Uses the client profile's business info.", "ইচ্ছা হলে। ক্লায়েন্ট প্রোফাইলের ব্যবসার তথ্য ব্যবহার করে।")}</span>
              {writeError && <span className="text-xs text-red-400">{writeError}</span>}
            </div>
            <Field label={tr("Primary text", "মূল লেখা")}>
              <textarea name="primary_text" rows={5} maxLength={2000} value={copy.primary_text} onChange={(e) => setCopy({ ...copy, primary_text: e.target.value })} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("Headline", "হেডলাইন")}>
                <input name="headline" maxLength={80} value={copy.headline} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} className={inputClass} />
              </Field>
              <Field label={tr("Description", "বিবরণ")}>
                <input name="description" maxLength={60} value={copy.description} onChange={(e) => setCopy({ ...copy, description: e.target.value })} className={inputClass} />
              </Field>
            </div>
            {objective === "sales" && (
              <Field label={tr("Button", "বাটন")} className="sm:w-1/2">
                <select name="cta" defaultValue={defaults.cta ?? "SHOP_NOW"} className={inputClass}>
                  {SALES_CTAS.map((c) => (
                    <option key={c} value={c}>
                      {CTA_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
      </Step>

      <Step n={5} title={tr("Automatic rules", "স্বয়ংক্রিয় নিয়ম")}>
        <Field label={tr(`Target cost per result (${currency ?? ""})`, `প্রতি রেজাল্টে টার্গেট খরচ (${currency ?? ""})`)} hint={tr("The rules below are set from this number.", "নিচের নিয়মগুলো এই সংখ্যা ধরে বসে।")} className="sm:w-1/2">
          <input name="rule_target" inputMode="decimal" defaultValue={defaults.target ?? ""} className={inputClass} />
        </Field>
        <div className="flex flex-col gap-2">
          {RULES.map(([id, en, bn, on]) => (
            <label key={id} className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-200">
              <input type="checkbox" name="rules" value={id} defaultChecked={on} className="accent-indigo-500" />
              {tr(en, bn)}
            </label>
          ))}
        </div>
      </Step>

      <Step n={6} title={tr("Name and create", "নাম আর তৈরি")}>
        <Field label={tr("Campaign name (optional)", "ক্যাম্পেইনের নাম (ইচ্ছা হলে)")}>
          <input name="name" maxLength={120} className={inputClass} />
        </Field>
        {state && !state.ok && (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending || pages.length === 0} className={buttonClass("primary", "self-start")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
          {tr("Make the draft", "খসড়া বানাও")}
        </button>
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          {source === "drive" ? <FolderOpen className="size-3.5" aria-hidden /> : <History className="size-3.5" aria-hidden />}
          {tr("Nothing goes to Meta yet: you check everything on the next page, then approve.", "এখনো Meta-তে কিছু যায় না: পরের পাতায় সব দেখে অনুমোদন দেবে।")}
        </p>
      </Step>
    </form>
  );
}
