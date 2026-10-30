import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, History, Rocket, Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient } from "@/lib/clients";
import { listPixels, listPromotePages } from "@/lib/meta/launch";
import AppShell from "@/components/AppShell";
import { Card, CardHeader, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";
import NewLaunchForm from "./NewLaunchForm";
import QuickLaunchForm from "./QuickLaunchForm";
import { listAudiences } from "@/lib/meta/audiences";
import { cn } from "@/components/ui";
import { loadClientProfile } from "@/lib/clientProfile";
import { LaunchStatusBadge } from "./LaunchStatusBadge";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("New ad", "নতুন বিজ্ঞাপন") };
}

// নির্দেশনা লিখে, ছবি/ভিডিও দিয়ে নতুন বিজ্ঞাপন: AI পরিকল্পনা করে, মালিক দেখে অনুমোদন দেয়
export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; primary?: string; headline?: string; description?: string }>;
}) {
  // দুই পথ: দ্রুত সেটআপ (AI ছাড়া, সাধারণ) আর AI নির্দেশনা
  const sp = await searchParams;
  const mode = sp.mode === "ai" ? "ai" : "quick";
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  const scope = await accountInCurrentClient(supabase, user.id, connection?.selected_ad_account_id ?? null);
  if (!connection?.selected_ad_account_id || !scope.ok) {
    return (
      <AppShell active="launch">
        <PageHeader title={tr("New ad", "নতুন বিজ্ঞাপন")} />
        <EmptyState
          icon={Building2}
          title={tr("Pick an ad account", "একটা Ad Account বাছো")}
          text={tr("Choose the client's ad account from the menu at the top.", "উপরের মেনু থেকে ক্লায়েন্টের Ad Account বাছো।")}
        />
      </AppShell>
    );
  }
  const accountId = connection.selected_ad_account_id;
  const token = decrypt(connection.access_token_encrypted);
  const currency = connection.selected_ad_account_currency as string | null;

  const [pages, pixels, { data: launches }, client, audienceList] = await Promise.all([
    listPromotePages(token, accountId).catch(() => null),
    listPixels(token, accountId).catch(() => []),
    supabase
      .from("ad_launches")
      .select("id, spec->>name, status, created_at")
      .eq("user_id", user.id)
      .eq("ad_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20),
    scope.client ? loadClientProfile(supabase, user.id, scope.client.id) : null,
    mode === "quick" ? listAudiences(token, accountId).catch(() => []) : [],
  ]);
  // প্রোফাইলের যা নতুন বিজ্ঞাপনে নিজে বসবে, তার ছোট তালিকা
  const pf = client?.profile ?? {};
  const genderLabel = pf.gender === "male" ? tr("men", "পুরুষ") : pf.gender === "female" ? tr("women", "নারী") : pf.gender ? tr("all", "সবাই") : "";
  const profileSummary = [
    pf.locations?.length ? pf.locations.map((l) => l.name.split(" (")[0]).slice(0, 3).join(", ") : "",
    pf.age_min || pf.age_max ? `${pf.age_min ?? 18}-${pf.age_max ?? 55}${pf.age_max === 65 ? "+" : ""} ${genderLabel}`.trim() : genderLabel,
    pf.interests?.length ? tr(`${pf.interests.length} interests`, `${pf.interests.length}টা আগ্রহ`) : "",
    pf.daily_budget ? tr(`${pf.daily_budget} ${currency ?? ""}/day`, `দিনে ${pf.daily_budget} ${currency ?? ""}`) : "",
    pf.exclude_buyers ? tr("new customers only", "শুধু নতুন ক্রেতা") : "",
    pf.about ? tr("business info", "ব্যবসার তথ্য") : "",
  ].filter(Boolean);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <AppShell active="launch">
      <PageHeader
        title={tr("New ad", "নতুন বিজ্ঞাপন")}
        description={tr(
          `${connection.selected_ad_account_name ?? accountId} · pick content and settings, check, approve`,
          `${connection.selected_ad_account_name ?? accountId} · কনটেন্ট আর সেটিং দাও, দেখে নাও, অনুমোদন দাও`,
        )}
      />
      {pages === null && (
        <Notice tone="warning">
          {tr("Couldn't load your Facebook pages from Meta. Try again shortly.", "Meta থেকে Facebook পেজ আনা যায়নি। একটু পরে আবার চেষ্টা করো।")}
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          {/* দুই পথের ট্যাব */}
          <nav aria-label={tr("How to make the ad", "কীভাবে বানাবে")} className="flex gap-1 border-b border-white/[0.07] p-2">
            {(
              [
                ["quick", Zap, tr("Quick setup", "দ্রুত সেটআপ"), "/launch"],
                ["ai", Sparkles, tr("With AI (brief)", "AI দিয়ে (নির্দেশনা)"), "/launch?mode=ai"],
              ] as const
            ).map(([id, Icon, label, href]) => (
              <Link
                key={id}
                href={href}
                aria-current={mode === id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
                  mode === id ? "glass-chip text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          {mode === "quick" ? (
            <div className="p-5">
              <QuickLaunchForm
                pages={pages ?? []}
                pixels={pixels.map((p) => ({ id: p.id, name: p.name, active: Boolean(p.last_fired_time) }))}
                audiences={audienceList.map((a) => ({ id: a.id, name: a.name, size: a.sizeLow }))}
                currency={currency}
                defaults={{
                  objective: pf.objective,
                  page_id: pf.page_id,
                  pixel_id: pf.pixel_id,
                  link: client?.website_url,
                  daily_budget: pf.daily_budget,
                  age_min: pf.age_min,
                  age_max: pf.age_max,
                  gender: pf.gender,
                  locations: pf.locations,
                  interests: pf.interests,
                  new_customers: pf.exclude_buyers,
                  cta: pf.cta,
                  target: client?.target_cost_per_order,
                  copy: { primary_text: sp.primary?.slice(0, 2000), headline: sp.headline?.slice(0, 80), description: sp.description?.slice(0, 60) },
                }}
              />
            </div>
          ) : (
          <>
          <CardHeader
            icon={Rocket}
            title={tr("Brief", "নির্দেশনা")}
            description={tr(
              "Nothing goes live until you approve it. Ads are created turned off first.",
              "তুমি অনুমোদন না দেওয়া পর্যন্ত কিছু চালু হবে না। বিজ্ঞাপন প্রথমে বন্ধ অবস্থায় তৈরি হয়।",
            )}
          />
          <div className="p-5">
            <NewLaunchForm
              userId={user.id}
              pages={pages ?? []}
              pixels={pixels.map((p) => ({ id: p.id, name: p.name, active: Boolean(p.last_fired_time) }))}
              currency={currency}
              defaultBudget={pf.daily_budget ?? (currency === "BDT" ? 1000 : 10)}
              defaults={{ objective: pf.objective, page_id: pf.page_id, pixel_id: pf.pixel_id, link: client?.website_url }}
              profileSummary={profileSummary}
            />
          </div>
          </>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader icon={History} title={tr("Recent", "সাম্প্রতিক")} />
          <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.07]">
            {(launches ?? []).map((l) => (
              <li key={l.id}>
                <Link href={`/launch/${l.id}`} className="flex items-center gap-2 px-5 py-3 text-sm hover:bg-white/50 dark:hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{(l as { name?: string }).name ?? "—"}</span>
                    <span className="block text-xs text-zinc-400">{when(l.created_at)}</span>
                  </span>
                  <LaunchStatusBadge status={l.status} />
                </Link>
              </li>
            ))}
            {(launches ?? []).length === 0 && (
              <li className="px-5 py-4 text-sm text-zinc-500">{tr("Nothing yet.", "এখনো কিছু নেই।")}</li>
            )}
          </ul>
          <div className="px-5 pb-4">
            <Link href="/manage" className={buttonClass("ghost", "px-0 text-xs")}>
              {tr("Turn ads on/off in Ads control →", "বিজ্ঞাপন চালু-বন্ধ: বিজ্ঞাপন নিয়ন্ত্রণ →")}
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
