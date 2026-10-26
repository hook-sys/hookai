import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, History, Rocket } from "lucide-react";
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
import { LaunchStatusBadge } from "./LaunchStatusBadge";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("New ad", "নতুন বিজ্ঞাপন") };
}

// নির্দেশনা লিখে, ছবি/ভিডিও দিয়ে নতুন বিজ্ঞাপন: AI পরিকল্পনা করে, মালিক দেখে অনুমোদন দেয়
export default async function LaunchPage() {
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

  const [pages, pixels, { data: launches }] = await Promise.all([
    listPromotePages(token, accountId).catch(() => null),
    listPixels(token, accountId).catch(() => []),
    supabase
      .from("ad_launches")
      .select("id, spec->>name, status, created_at")
      .eq("user_id", user.id)
      .eq("ad_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <AppShell active="launch">
      <PageHeader
        title={tr("New ad", "নতুন বিজ্ঞাপন")}
        description={tr(
          `${connection.selected_ad_account_name ?? accountId} · write what you want, Hook plans it, you approve`,
          `${connection.selected_ad_account_name ?? accountId} · কী চাও লেখো, Hook পরিকল্পনা করবে, তুমি অনুমোদন দেবে`,
        )}
      />
      {pages === null && (
        <Notice tone="warning">
          {tr("Couldn't load your Facebook pages from Meta. Try again shortly.", "Meta থেকে Facebook পেজ আনা যায়নি। একটু পরে আবার চেষ্টা করো।")}
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
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
              defaultBudget={currency === "BDT" ? 1000 : 10}
            />
          </div>
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
