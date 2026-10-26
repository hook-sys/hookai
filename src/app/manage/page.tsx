import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, History, KeyRound, Rocket, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { addDays, todayIn } from "@/lib/dates";
import { formatMoney, formatNumber } from "@/lib/format";
import { loadLiveReport, type LiveCampaign } from "@/lib/insights/live";
import { campaignOutcomes, deliveryRate, knownCampaigns, loadOrders, type CampaignOutcome } from "@/lib/orders";
import { clientOfAccount, loadClients } from "@/lib/clients";
import { canManageAds, loadAccountStructure, type ManagedCampaign } from "@/lib/meta/manage";
import AppShell from "@/components/AppShell";
import { accountInCurrentClient } from "@/lib/clients";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, buttonClass, cn } from "@/components/ui";
import { BudgetEditor, StatusSwitch } from "./Controls";

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ") };
}

// ক্যাম্পেইন, Ad Set, Ad চালু-বন্ধ আর দৈনিক বাজেট বদল; পাশে গত ৭ দিনের খরচ, ফল আর অর্ডারের হিসাব
export default async function ManagePage() {
  const locale = await getLocale();
  const tr = makeTr(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, selected_ad_account_timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const expired = connection?.token_expires_at && new Date(connection.token_expires_at) < new Date();
  if (!connection?.selected_ad_account_id || expired) {
    return (
      <AppShell active="manage">
        <PageHeader title={tr("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ")} />
        <EmptyState
          icon={SlidersHorizontal}
          title={tr("Connect Meta and pick an ad account", "Meta কানেক্ট করে Ad Account বেছে নাও")}
          text={tr("Then you can turn ads on or off and change budgets here.", "তারপর এখান থেকে বিজ্ঞাপন চালু-বন্ধ আর বাজেট বদলাতে পারবে।")}
          action={<Link href="/settings" className={buttonClass("primary")}>{tr("Go to Settings", "সেটিংসে যাও")}</Link>}
        />
      </AppShell>
    );
  }

  // ক্লায়েন্ট বাছা থাকলে শুধু তার Ad Account-এর হিসাব দেখায়
  const scope = await accountInCurrentClient(supabase, user.id, connection.selected_ad_account_id);
  if (!scope.ok) {
    return (
      <AppShell active="manage">
        <PageHeader title={scope.client?.name ?? ""} />
        <EmptyState
          icon={Building2}
          title={tr("Pick one of this client's ad accounts", "এই ক্লায়েন্টের একটা Ad Account বাছো")}
          text={tr(
            "Choose an ad account from the menu at the top. If the client has none yet, assign them in Settings.",
            "উপরের মেনু থেকে একটা Ad Account বাছো। ক্লায়েন্টে এখনো কোনো Ad Account না থাকলে সেটিংস থেকে যোগ করো।",
          )}
          action={
            <Link href="/settings#clients" className={buttonClass("primary")}>
              {tr("Open Settings", "সেটিংস খোলো")}
            </Link>
          }
        />
      </AppShell>
    );
  }
  const accountId = connection.selected_ad_account_id;
  const currency = connection.selected_ad_account_currency;
  const token = decrypt(connection.access_token_encrypted);
  const today = todayIn(connection.selected_ad_account_timezone);
  const range = { since: addDays(today, -7), until: addDays(today, -1) };
  // এই Ad Account যে ক্লায়েন্টের, শুধু তার অর্ডার
  const { accounts: clientAccounts } = await loadClients(supabase, user.id);
  const ownerClient = clientOfAccount(clientAccounts, accountId);

  let structure: ManagedCampaign[] = [];
  let loadError: string | null = null;
  const [allowed, live, orders, campaignsKnown, { data: log }] = await Promise.all([
    canManageAds(token),
    loadLiveReport({ supabase, userId: user.id, token, accountId }, range, today, currency).catch(() => null),
    loadOrders(supabase, user.id, range, ownerClient).catch(() => []),
    knownCampaigns(supabase, user.id, accountId),
    supabase
      .from("ad_change_log")
      .select("id, level, object_name, action, old_value, new_value, ok, error, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  try {
    structure = await loadAccountStructure(token, accountId, currency);
  } catch (err) {
    console.error("manage structure failed", err instanceof Error ? err.message : err);
    loadError = tr("Couldn't load campaigns from Meta. Try again shortly.", "Meta থেকে ক্যাম্পেইন আনা যায়নি। একটু পরে আবার চেষ্টা করো।");
  }
  const perf = new Map<string, LiveCampaign>((live?.campaigns ?? []).map((c) => [c.id, c]));
  const { rows } = await campaignOutcomes(supabase, user.id, accountId, range, orders, campaignsKnown, tr);
  const outcome = new Map<string, CampaignOutcome>(rows.filter((r) => r.campaignId).map((r) => [r.key, r]));
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  const statusNote = (effective: string, status: string) => {
    if (status !== "ACTIVE" || effective === "ACTIVE") return null;
    const map: Record<string, [string, string]> = {
      CAMPAIGN_PAUSED: ["Campaign is off", "ক্যাম্পেইন বন্ধ"],
      ADSET_PAUSED: ["Ad set is off", "Ad Set বন্ধ"],
      IN_PROCESS: ["Processing", "প্রসেস হচ্ছে"],
      PENDING_REVIEW: ["In review", "রিভিউতে"],
      DISAPPROVED: ["Rejected", "বাতিল (Disapproved)"],
      WITH_ISSUES: ["Has issues", "সমস্যা আছে"],
      PENDING_BILLING_INFO: ["Billing needed", "বিলিং দরকার"],
    };
    const m = map[effective];
    return m ? tr(m[0], m[1]) : effective.replaceAll("_", " ").toLowerCase();
  };

  return (
    <AppShell active="manage">
      <PageHeader
        title={tr("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ")}
        description={tr(
          `${connection.selected_ad_account_name ?? accountId} · numbers are for the last 7 days (excluding today)`,
          `${connection.selected_ad_account_name ?? accountId} · হিসাব গত ৭ দিনের (আজ বাদে)`,
        )}
        actions={
          <Link href="/launch" className={buttonClass("primary")}>
            <Rocket className="size-4" aria-hidden />
            {tr("New ad", "নতুন বিজ্ঞাপন")}
          </Link>
        }
      />

      {!allowed && (
        <Notice tone="warning">
          <KeyRound className="mr-1 inline size-4" aria-hidden />
          {tr(
            "Hook can't change ads yet. Reconnect Facebook and allow \"Manage ads\" when Facebook asks.",
            "Hook এখনো বিজ্ঞাপন বদলাতে পারে না। Facebook আবার কানেক্ট করো, আর Facebook জিজ্ঞেস করলে \"Manage ads\" অনুমতি দাও।",
          )}{" "}
          <a href="/api/meta/connect" className="font-semibold underline">
            {tr("Reconnect Facebook", "Facebook আবার কানেক্ট করো")}
          </a>
        </Notice>
      )}
      {loadError && <Notice tone="warning">{loadError}</Notice>}
      <Notice tone="info">
        {tr(
          "Changes go live on Meta right away and affect real spend. Every change asks first and is logged below. A budget can at most double in one step.",
          "পরিবর্তন সাথে সাথে Meta-তে কার্যকর হয় আর আসল খরচে প্রভাব ফেলে। প্রতিটা পরিবর্তনের আগে নিশ্চিত হতে চাইবে, আর নিচে লগ থাকবে। একবারে বাজেট সর্বোচ্চ দ্বিগুণ করা যায়।",
        )}
      </Notice>

      <div className="mb-6 flex flex-col gap-3">
        {structure.length === 0 && !loadError && (
          <Card className="p-6 text-center text-sm text-zinc-500">{tr("No campaigns in this ad account.", "এই Ad Account-এ কোনো ক্যাম্পেইন নেই।")}</Card>
        )}
        {structure.map((c) => {
          const p = perf.get(c.id);
          const o = outcome.get(c.id);
          const cpr = p && p.results > 0 ? p.spend / p.results : null;
          const dr = o ? deliveryRate(o) : null;
          const note = statusNote(c.effective_status, c.status);
          return (
            <Card key={c.id} className="min-w-0">
              <div className="flex flex-wrap items-start gap-4 px-5 py-4">
                <StatusSwitch id={c.id} level="campaign" name={c.name} active={c.status === "ACTIVE"} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </Link>
                    {note && <Badge tone="warning">{note}</Badge>}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{tr("Spend", "খরচ")}: {formatMoney(p?.spend ?? 0, currency)}</span>
                    <span>{tr("Results", "Result")}: {formatNumber(p?.results ?? 0)}</span>
                    <span>{tr("Cost/result", "প্রতি Result")}: {cpr === null ? "—" : formatMoney(cpr, currency)}</span>
                    {o && o.orders > 0 && (
                      <>
                        <span>{tr("Orders", "অর্ডার")}: {o.orders}</span>
                        <span>{tr("Delivered", "ডেলিভারি")}: {o.delivered} ({pct(dr)})</span>
                        <span>{tr("Cancel rate", "ক্যানসেল রেট")}: {pct(o.orders ? o.cancelled / o.orders : null)}</span>
                        <span>
                          {tr("Cost/delivered", "খরচ/ডেলিভারি")}: {o.delivered && p ? formatMoney(p.spend / o.delivered, currency) : "—"}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {c.daily_budget !== null ? (
                  <BudgetEditor id={c.id} level="campaign" name={c.name} budget={c.daily_budget} currency={currency} />
                ) : c.lifetime_budget !== null ? (
                  <span className="text-xs text-zinc-500">
                    {tr("Lifetime budget", "লাইফটাইম বাজেট")}: {formatMoney(c.lifetime_budget, currency)}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">{tr("Budget is set on ad sets", "বাজেট Ad Set-এ")}</span>
                )}
              </div>

              {c.adsets.length > 0 && (
                <details className="border-t border-zinc-100 dark:border-zinc-800">
                  <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {tr(`${c.adsets.length} ad sets`, `${c.adsets.length}টি Ad Set`)}
                  </summary>
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {c.adsets.map((s) => {
                      const sNote = statusNote(s.effective_status, s.status);
                      return (
                        <li key={s.id} className="px-5 py-3 pl-8">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusSwitch id={s.id} level="adset" name={s.name} active={s.status === "ACTIVE"} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={s.name}>
                              {s.name} {sNote && <Badge tone="warning">{sNote}</Badge>}
                            </span>
                            {s.daily_budget !== null ? (
                              <BudgetEditor id={s.id} level="adset" name={s.name} budget={s.daily_budget} currency={currency} />
                            ) : s.lifetime_budget !== null ? (
                              <span className="text-xs text-zinc-500">
                                {tr("Lifetime", "লাইফটাইম")}: {formatMoney(s.lifetime_budget, currency)}
                              </span>
                            ) : null}
                          </div>
                          {s.ads.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1.5 border-l border-zinc-200 pl-4 dark:border-zinc-800">
                              {s.ads.map((a) => {
                                const aNote = statusNote(a.effective_status, a.status);
                                return (
                                  <li key={a.id} className="flex items-center gap-3 text-sm">
                                    <StatusSwitch id={a.id} level="ad" name={a.name} active={a.status === "ACTIVE"} />
                                    <span className={cn("min-w-0 truncate", a.status !== "ACTIVE" && "text-zinc-400")} title={a.name}>
                                      {a.name}
                                    </span>
                                    {aNote && <Badge tone="warning">{aNote}</Badge>}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader icon={History} title={tr("Recent changes", "সাম্প্রতিক পরিবর্তন")} description={tr("Every change made from Hook.", "Hook থেকে করা প্রতিটা পরিবর্তন।")} />
        {!log || log.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">{tr("No changes yet.", "এখনো কোনো পরিবর্তন হয়নি।")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="w-36 shrink-0 text-xs text-zinc-500">{when(l.created_at)}</span>
                <span className="min-w-0 flex-1 truncate">{l.object_name ?? "—"}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {l.action === "status"
                    ? `${l.old_value ?? "?"} → ${l.new_value}`
                    : tr(`Budget ${l.old_value} → ${l.new_value}`, `বাজেট ${l.old_value} → ${l.new_value}`)}
                </span>
                {l.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">{tr("Failed", "ব্যর্থ")}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
