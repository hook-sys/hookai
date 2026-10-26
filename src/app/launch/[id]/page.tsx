import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import type { LaunchSpec } from "@/lib/meta/launch";
import type { LaunchMeta } from "@/lib/meta/launchRun";
import AppShell from "@/components/AppShell";
import { Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { LaunchStatusBadge } from "../LaunchStatusBadge";
import ReviewForm, { LaunchButtons } from "./ReviewForm";

// Meta-তে ভিডিও প্রসেস আর তৈরি হতে সময় লাগে
export const maxDuration = 300;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Review ad", "বিজ্ঞাপন দেখে নাও") };
}

export default async function LaunchReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: row }, { data: conn }] = await Promise.all([
    supabase
      .from("ad_launches")
      .select("id, ad_account_id, brief, spec, status, meta, error, created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("meta_connections").select("selected_ad_account_id, selected_ad_account_currency").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!row) notFound();
  const spec = row.spec as LaunchSpec & { unmatched?: string[] };
  const meta = (row.meta ?? {}) as LaunchMeta;
  const editable = row.status === "draft" || row.status === "failed";
  const otherAccount = conn?.selected_ad_account_id !== row.ad_account_id;
  const actId = row.ad_account_id.replace(/^act_/, "");
  const managerUrl = meta.campaign_id
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actId}&selected_campaign_ids=${meta.campaign_id}`
    : null;

  return (
    <AppShell active="launch">
      <PageHeader
        title={spec.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LaunchStatusBadge status={row.status} />
            <span>
              {spec.objective === "sales" ? tr("Website sales", "ওয়েবসাইটে বিক্রি") : tr("Messenger messages", "Messenger মেসেজ")} ·{" "}
              {spec.page_name}
            </span>
          </span>
        }
        actions={
          <>
            <Link href="/launch" className={buttonClass("ghost")}>
              {tr("All launches", "সব বিজ্ঞাপন")}
            </Link>
            {managerUrl && (
              <a href={managerUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Ads Manager <ExternalLink className="size-4" aria-hidden />
              </a>
            )}
          </>
        }
      />

      {otherAccount && (
        <Notice tone="warning">
          {tr("This launch belongs to another ad account. Switch to it at the top to continue.", "এই বিজ্ঞাপন অন্য Ad Account-এর। চালিয়ে যেতে উপর থেকে সেই অ্যাকাউন্ট বাছো।")}
        </Notice>
      )}
      {row.status === "failed" && row.error && <Notice tone="danger">{row.error}</Notice>}
      {spec.unmatched && spec.unmatched.length > 0 && editable && (
        <Notice tone="warning">
          {tr(
            `Meta didn't recognise: ${spec.unmatched.join(", ")}. Add them by search below if needed.`,
            `Meta চিনতে পারেনি: ${spec.unmatched.join(", ")}। দরকার হলে নিচে খুঁজে যোগ করো।`,
          )}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader
            title={editable ? tr("Check and change the plan", "পরিকল্পনা দেখে বদলাও") : tr("Plan", "পরিকল্পনা")}
            description={tr("Your brief:", "তোমার নির্দেশনা:") + " " + row.brief.slice(0, 300) + (row.brief.length > 300 ? "…" : "")}
          />
          <div className="p-5">
            <ReviewForm id={row.id} spec={spec} currency={conn?.selected_ad_account_currency ?? null} editable={editable} />
          </div>
        </Card>
        <Card className="self-start">
          <CardHeader title={tr("Approve", "অনুমোদন")} />
          <div className="flex flex-col gap-3 p-5 text-sm">
            <LaunchButtons id={row.id} status={row.status} canDelete={row.status === "draft" && !meta.campaign_id} disabled={otherAccount} />
            <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
              <li>{tr("1. Make: created on Meta turned off, no spend.", "১. তৈরি: Meta-তে বন্ধ অবস্থায় তৈরি, খরচ নেই।")}</li>
              <li>{tr("2. Turn on: campaign, ad set and ads go live after Meta's review.", "২. চালু: Meta রিভিউর পর ক্যাম্পেইন, Ad Set আর বিজ্ঞাপন চলবে।")}</li>
              {spec.objective === "sales" && (
                <li>{tr("Links get UTM tags, so orders match this campaign.", "লিংকে UTM বসে, তাই অর্ডার এই ক্যাম্পেইনের সাথে মিলবে।")}</li>
              )}
            </ul>
            {spec.rules && (
              <p className="rounded-lg glass-chip px-3 py-2 text-xs">
                <span className="font-medium">{tr("Your rule: ", "তোমার নিয়ম: ")}</span>
                {spec.rules}
                <span className="block text-zinc-400">{tr("Automatic rules are coming next; for now check it in Ads control.", "স্বয়ংক্রিয় নিয়ম আসছে; আপাতত বিজ্ঞাপন নিয়ন্ত্রণ থেকে দেখো।")}</span>
              </p>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
