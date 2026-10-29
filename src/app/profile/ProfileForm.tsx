"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { SALES_CTAS } from "@/lib/meta/launch";
import type { ClientWithProfile } from "@/lib/clientProfile";
import { CTA_LABELS, Result, TargetPicker, type Chip } from "@/app/launch/[id]/ReviewForm";
import { saveProfile, type ProfileState } from "./actions";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="glass-panel rounded-3xl">
      <header className="border-b border-white/[0.07] px-5 py-4">
        <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </header>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
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

export default function ProfileForm({
  client,
  pages,
  pixels,
  currency,
}: {
  client: ClientWithProfile;
  pages: { id: string; name: string }[];
  pixels: { id: string; name: string }[];
  currency: string | null;
}) {
  const tr = useTr();
  const p = client.profile;
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, null);
  const [objective, setObjective] = useState(p.objective ?? "sales");
  const [pageId, setPageId] = useState(p.page_id ?? pages[0]?.id ?? "");
  const [locations, setLocations] = useState<Chip[]>(p.locations ?? []);
  const [interests, setInterests] = useState<Chip[]>((p.interests ?? []).map((i) => ({ key: i.id, name: i.name, type: "interest" })));
  const pageName = pages.find((x) => x.id === pageId)?.name ?? p.page_name ?? "";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="clientId" value={client.id} />
      <input type="hidden" name="page_name" value={pageName} />
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <input type="hidden" name="interests" value={JSON.stringify(interests.map((i) => ({ id: i.key, name: i.name })))} />

      <Section
        title={tr("About the business", "ব্যবসার তথ্য")}
        hint={tr("The AI reads this every time it writes an ad, so you don't have to repeat it.", "AI প্রতিবার বিজ্ঞাপন লেখার সময় এটা পড়ে, তাই বারবার বলতে হয় না।")}
      >
        <Field
          label={tr("What they sell, prices, delivery, offers, phone, tone", "কী বিক্রি করে, দাম, ডেলিভারি, অফার, ফোন, লেখার ধরন")}
          hint={tr("Only facts; the AI won't invent anything that isn't here or in the brief.", "শুধু সত্য তথ্য; এখানে বা নির্দেশনায় না থাকলে AI কিছু বানিয়ে লিখবে না।")}
        >
          <textarea
            name="about"
            rows={6}
            maxLength={3000}
            defaultValue={p.about ?? ""}
            className={inputClass}
            placeholder={tr(
              "e.g. Genuine leather shoes made in Bangladesh. Prices 2,000–3,500 tk. Cash on delivery all over Bangladesh, 60 tk in Dhaka, 120 tk outside. 7-day exchange. Tone: confident, premium, short sentences.",
              "যেমন: বাংলাদেশে তৈরি আসল চামড়ার জুতা। দাম ২০০০–৩৫০০ টাকা। সারা দেশে ক্যাশ অন ডেলিভারি, ঢাকায় ৬০ টাকা, বাইরে ১২০ টাকা। ৭ দিনে এক্সচেঞ্জ। লেখার ধরন: আত্মবিশ্বাসী, প্রিমিয়াম, ছোট বাক্য।",
            )}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tr("Website", "ওয়েবসাইট")}>
            <input name="website_url" defaultValue={client.website_url ?? ""} placeholder="https://" className={inputClass} />
          </Field>
          <Field label={tr(`Target cost per order (${currency ?? ""})`, `অর্ডারপ্রতি খরচের লক্ষ্য (${currency ?? ""})`)} hint={tr("Used for red/yellow/green on Home.", "হোমে লাল/হলুদ/সবুজের জন্য।")}>
            <input name="target" inputMode="decimal" defaultValue={client.target_cost_per_order ?? ""} className={inputClass} />
          </Field>
          <Field label={tr("Ad language", "বিজ্ঞাপনের ভাষা")}>
            <select name="language" defaultValue={p.language ?? "bn"} className={inputClass}>
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title={tr("Ad defaults", "বিজ্ঞাপনের সাধারণ মান")} hint={tr("Filled in automatically on every new ad.", "প্রতিটা নতুন বিজ্ঞাপনে নিজে বসে যায়।")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["sales", tr("Website sales", "ওয়েবসাইটে বিক্রি")],
              ["messages", tr("Messenger messages", "Messenger মেসেজ")],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-sm",
                objective === value ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/[0.08] bg-white/[0.03]",
              )}
            >
              <input type="radio" name="objective" value={value} checked={objective === value} onChange={() => setObjective(value)} className="accent-indigo-500" />
              {label}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("Facebook page", "Facebook পেজ")}>
            <select name="page_id" value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputClass}>
              {p.page_id && !pages.some((x) => x.id === p.page_id) && <option value={p.page_id}>{p.page_name ?? p.page_id}</option>}
              {pages.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          {objective === "sales" && (
            <Field label="Pixel">
              <select name="pixel_id" defaultValue={p.pixel_id ?? pixels[0]?.id ?? ""} className={inputClass}>
                {p.pixel_id && !pixels.some((x) => x.id === p.pixel_id) && <option value={p.pixel_id}>{p.pixel_id}</option>}
                {pixels.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr(`Daily budget (${currency ?? ""})`, `দৈনিক বাজেট (${currency ?? ""})`)}>
            <input name="daily_budget" inputMode="decimal" defaultValue={p.daily_budget ?? ""} className={inputClass} />
          </Field>
          {objective === "sales" && (
            <Field label={tr("Button", "বাটন")}>
              <select name="cta" defaultValue={p.cta ?? "SHOP_NOW"} className={inputClass}>
                {SALES_CTAS.map((c) => (
                  <option key={c} value={c}>
                    {CTA_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title={tr("Usual audience", "সাধারণ অডিয়েন্স")} hint={tr("Used when the brief doesn't say who to target.", "নির্দেশনায় কাদের দেখাবে না বললে এটা বসে।")}>
        <TargetPicker kind="location" label={tr("Locations", "লোকেশন")} value={locations} onChange={setLocations} disabled={false} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tr("Age from", "বয়স থেকে")}>
            <input name="age_min" type="number" min={18} max={65} defaultValue={p.age_min ?? 18} className={inputClass} />
          </Field>
          <Field label={tr("Age to", "বয়স পর্যন্ত")} hint={tr("65 = 65+", "৬৫ = ৬৫+")}>
            <input name="age_max" type="number" min={18} max={65} defaultValue={p.age_max ?? 55} className={inputClass} />
          </Field>
          <Field label={tr("Gender", "লিঙ্গ")}>
            <select name="gender" defaultValue={p.gender ?? "all"} className={inputClass}>
              <option value="all">{tr("All", "সবাই")}</option>
              <option value="male">{tr("Men", "পুরুষ")}</option>
              <option value="female">{tr("Women", "নারী")}</option>
            </select>
          </Field>
        </div>
        <TargetPicker kind="interest" label={tr("Interests", "আগ্রহ")} value={interests} onChange={setInterests} disabled={false} />
        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm">
          <input type="checkbox" name="exclude_buyers" defaultChecked={p.exclude_buyers ?? false} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block font-medium text-zinc-100">{tr("New customers only", "শুধু নতুন ক্রেতা")}</span>
            <span className="block text-xs text-zinc-500">
              {tr("Leave out past buyers (the Hook buyers audience) on new ads.", "নতুন বিজ্ঞাপনে আগের ক্রেতাদের (Hook-এর ক্রেতা অডিয়েন্স) বাদ দাও।")}
            </span>
          </span>
        </label>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tr("Save profile", "প্রোফাইল সংরক্ষণ")}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}
