import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { listPixels, listPromotePages, type LaunchSpec } from "@/lib/meta/launch";
import { listAudiences } from "@/lib/meta/audiences";
import { decrypt } from "@/lib/crypto";
import type { LaunchMeta } from "@/lib/meta/launchRun";
import AppShell from "@/components/AppShell";
import { Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { LaunchStatusBadge } from "../LaunchStatusBadge";
import { LaunchButtons } from "./ReviewForm";
import LaunchEditor from "./LaunchEditor";

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
    supabase.from("meta_connections").select("access_token_encrypted, selected_ad_account_id, selected_ad_account_currency").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!row) notFound();
  const spec = row.spec as LaunchSpec & { unmatched?: string[] };
  // খসড়া বদলানো গেলে Ads Manager-এর মতো বাছাইয়ের তালিকা: অডিয়েন্স, পেজ, Pixel
  const canEdit = (row.status === "draft" || row.status === "failed") && Boolean(conn?.access_token_encrypted);
  const token = canEdit ? decrypt(conn!.access_token_encrypted) : "";
  const [audienceList, pages, pixels, signed] = await Promise.all([
    canEdit ? listAudiences(token, row.ad_account_id).catch(() => []) : [],
    canEdit ? listPromotePages(token, row.ad_account_id).catch(() => []) : [],
    canEdit && spec.objective === "sales" ? listPixels(token, row.ad_account_id).catch(() => []) : [],
    // প্রিভিউর জন্য আপলোড করা ছবি/ভিডিওর সাময়িক লিংক
    spec.media.length
      ? supabase.storage.from("ad-media").createSignedUrls(spec.media.map((m) => m.path), 60 * 60).then((r) => r.data ?? [])
      : [],
  ]);
  const audiences = audienceList.map((a) => ({ id: a.id, name: a.name, subtype: a.subtype, size: a.sizeLow }));
  const media = spec.media.map((m) => ({ ...m, url: signed.find((x) => x.path === m.path)?.signedUrl ?? null }));
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

      <p className="mb-5 text-sm text-zinc-400">
        <span className="font-medium text-zinc-300">{tr("Your brief:", "তোমার নির্দেশনা:")}</span> {row.brief.slice(0, 300)}
        {row.brief.length > 300 ? "…" : ""}
      </p>

      <LaunchEditor
        id={row.id}
        spec={spec}
        currency={conn?.selected_ad_account_currency ?? null}
        editable={editable}
        audiences={audiences}
        pages={pages.map((p) => ({ id: p.id, name: p.name }))}
        pixels={pixels.map((p) => ({ id: p.id, name: p.name }))}
        media={media}
        aside={
          <Card>
            <CardHeader title={tr("Publish", "প্রকাশ")} />
            <div className="flex flex-col gap-3 p-5 text-sm">
              <LaunchButtons id={row.id} status={row.status} canDelete={row.status === "draft" && !meta.campaign_id} disabled={otherAccount} />
              <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
                <li>{tr("Save your changes first.", "আগে পরিবর্তন সংরক্ষণ করো।")}</li>
                <li>{tr("1. Make: created on Meta turned off, no spend.", "১. তৈরি: Meta-তে বন্ধ অবস্থায় তৈরি, খরচ নেই।")}</li>
                <li>{tr("2. Turn on: campaign, ad set and ads go live after Meta's review.", "২. চালু: Meta রিভিউর পর ক্যাম্পেইন, Ad Set আর বিজ্ঞাপন চলবে।")}</li>
              </ul>
            </div>
          </Card>
        }
      />
    </AppShell>
  );
}
