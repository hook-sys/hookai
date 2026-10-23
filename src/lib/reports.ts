import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiSummary } from "@/lib/ai/summary";
import type { CampaignReport } from "@/lib/ai/campaignReport";
import { decrypt } from "@/lib/crypto";
import { getAdAccounts } from "@/lib/meta/graph";
import { enTr, type Locale, type Tr } from "@/lib/i18n";

// সব AI রিপোর্ট (অ্যাকাউন্টের সারসংক্ষেপ ও ক্যাম্পেইন রিপোর্ট) ডাটাবেসেই জমা থাকে।
// এখানে সেগুলো এক তালিকায় আনা, একটি খোলা (দরকার হলে অনুবাদসহ), আর CSV বানানো হয়।

export type ReportKind = "summary" | "campaign";

export function isReportKind(value: unknown): value is ReportKind {
  return value === "summary" || value === "campaign";
}

export type ReportListItem = {
  kind: ReportKind;
  id: string;
  accountName: string;
  campaignName: string | null; // ক্যাম্পেইন রিপোর্টে; সারসংক্ষেপে null (সব ক্যাম্পেইন)
  headline: string;
  date_from: string | null;
  date_to: string | null;
  created_at: string;
};

type Base = {
  id: string;
  accountName: string;
  date_from: string | null;
  date_to: string | null;
  created_at: string;
  // রিপোর্ট যে ভাষায় লেখা হয়েছিল, আর এখন যে ভাষায় দেখানো হচ্ছে
  originalLocale: Locale;
  shownLocale: Locale;
};

export type FullReport =
  | (Base & { kind: "summary"; campaignName: null; campaigns: string[]; content: AiSummary })
  | (Base & { kind: "campaign"; campaignName: string; campaigns: string[]; content: CampaignReport });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ad Account ID থেকে নাম। Meta থেকে একবার তালিকা আনা হয়; না পেলে জমা থাকা নাম বা ID।
async function accountNames(supabase: SupabaseClient, userId: string) {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return map;
  if (data.selected_ad_account_id && data.selected_ad_account_name) {
    map.set(data.selected_ad_account_id, data.selected_ad_account_name);
  }
  const expired = data.token_expires_at && new Date(data.token_expires_at) < new Date();
  if (!expired) {
    try {
      for (const a of await getAdAccounts(decrypt(data.access_token_encrypted))) map.set(a.id, a.name);
    } catch (err) {
      console.error("account names failed", err instanceof Error ? err.message : err);
    }
  }
  return map;
}

const localeOf = (content: { locale?: Locale } | null | undefined): Locale => content?.locale ?? "bn";

export async function listReports(
  supabase: SupabaseClient,
  userId: string,
  kind: ReportKind | null,
  limit = 100,
): Promise<ReportListItem[]> {
  const [names, summaries, campaigns] = await Promise.all([
    accountNames(supabase, userId),
    kind === "campaign"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("ai_summaries")
          .select("id, ad_account_id, date_from, date_to, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
    kind === "summary"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("campaign_reports")
          .select("id, ad_account_id, campaign_name, campaign_id, date_from, date_to, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
  ]);

  const nameOf = (id: string, stored?: string) => names.get(id) ?? stored ?? id;
  const items: ReportListItem[] = [
    ...((summaries.data ?? []) as Record<string, unknown>[]).map((s) => {
      const content = s.content as AiSummary;
      return {
        kind: "summary" as const,
        id: String(s.id),
        accountName: nameOf(String(s.ad_account_id), content?.account_name),
        campaignName: null,
        headline: String(content?.headline ?? ""),
        date_from: (s.date_from as string) ?? null,
        date_to: (s.date_to as string) ?? null,
        created_at: String(s.created_at),
      };
    }),
    ...((campaigns.data ?? []) as Record<string, unknown>[]).map((c) => ({
      kind: "campaign" as const,
      id: String(c.id),
      accountName: nameOf(String(c.ad_account_id)),
      campaignName: String(c.campaign_name ?? c.campaign_id),
      headline: String((c.content as CampaignReport)?.headline ?? ""),
      date_from: (c.date_from as string) ?? null,
      date_to: (c.date_to as string) ?? null,
      created_at: String(c.created_at),
    })),
  ];
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export async function getTranslation(
  supabase: SupabaseClient,
  kind: ReportKind,
  id: string,
  locale: Locale,
) {
  const { data } = await supabase
    .from("report_translations")
    .select("content")
    .eq("report_kind", kind)
    .eq("report_id", id)
    .eq("locale", locale)
    .maybeSingle();
  return data?.content ?? null;
}

// RLS নিশ্চিত করে শুধু নিজের রিপোর্ট পাওয়া যায়; তবু user_id মিলিয়ে নেওয়া হয়।
// want দিলে সেই ভাষার অনুবাদ থাকলে সেটি দেখায়।
export async function getReport(
  supabase: SupabaseClient,
  userId: string,
  kind: ReportKind,
  id: string,
  want?: Locale,
): Promise<FullReport | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const table = kind === "summary" ? "ai_summaries" : "campaign_reports";
  const { data } = await supabase
    .from(table)
    .select(kind === "summary" ? "id, ad_account_id, date_from, date_to, content, created_at" : "id, ad_account_id, campaign_id, campaign_name, date_from, date_to, content, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Record<string, unknown> & { content: AiSummary & CampaignReport };

  const original = row.content;
  const originalLocale = localeOf(original);
  let content = original;
  let shownLocale = originalLocale;
  if (want && want !== originalLocale) {
    const translated = await getTranslation(supabase, kind, id, want);
    if (translated) {
      content = translated;
      shownLocale = want;
    }
  }

  const names = await accountNames(supabase, userId);
  const base = {
    id: String(row.id),
    accountName: names.get(String(row.ad_account_id)) ?? original.account_name ?? String(row.ad_account_id),
    date_from: (row.date_from as string) ?? null,
    date_to: (row.date_to as string) ?? null,
    created_at: String(row.created_at),
    originalLocale,
    shownLocale,
  };
  if (kind === "summary") {
    return { ...base, kind, campaignName: null, campaigns: original.campaigns ?? [], content };
  }
  const campaignName = String(row.campaign_name ?? row.campaign_id);
  return { ...base, kind, campaignName, campaigns: [campaignName], content };
}

// ---------- CSV ----------

const PRIORITY = (p: string, tr: Tr) =>
  p === "high" ? tr("Urgent", "জরুরি") : p === "medium" ? tr("Important", "গুরুত্বপূর্ণ") : tr("Can wait", "পরে করলেও চলে");

// Excel-এ সূত্র হিসেবে চলে যাওয়া আটকাতে =, +, -, @ দিয়ে শুরু হলে আগে ' বসানো হয়
function cell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function campaignsLabel(r: FullReport, tr: Tr) {
  if (r.kind === "campaign") return r.campaignName;
  return r.campaigns.length > 0
    ? tr(`All campaigns (${r.campaigns.length}): `, `সব ক্যাম্পেইন (${r.campaigns.length}টি): `) + r.campaigns.join(", ")
    : tr("All campaigns", "সব ক্যাম্পেইন");
}

// CSV-এর লেবেলও রিপোর্ট যে ভাষায় দেখানো হচ্ছে সেই ভাষায়
export function reportToCsv(r: FullReport, tr: Tr = enTr) {
  const rows: string[][] = [[tr("Section", "অংশ"), tr("Item", "বিষয়"), tr("Detail", "বিস্তারিত"), tr("Priority", "গুরুত্ব")]];
  const add = (section: string, item: string, detail = "", priority = "") => rows.push([section, item, detail, priority]);

  add(tr("Report", "রিপোর্ট"), r.kind === "summary" ? tr("AI summary", "AI সারসংক্ষেপ") : tr("Campaign report", "ক্যাম্পেইন রিপোর্ট"));
  add("Ad Account", r.accountName);
  add(tr("Campaigns", "ক্যাম্পেইন"), campaignsLabel(r, tr));
  add(tr("Period", "সময়"), `${r.date_from ?? ""} – ${r.date_to ?? ""}`);
  add(
    tr("Created", "তৈরি"),
    new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }),
  );
  add(tr("Headline", "মূল কথা"), r.content.headline);
  if (r.content.overview) add(tr("Overview", "সংক্ষেপে"), r.content.overview);

  if (r.kind === "summary") {
    const c = r.content;
    c.highlights.forEach((h) => add(tr("Working well", "ভালো চলছে"), h));
    c.concerns.forEach((h) => add(tr("Needs attention", "নজর দেওয়া দরকার"), h));
    c.recommendations.forEach((x) =>
      add(tr("What to do", "এখন কী করবে"), x.action, [x.campaign, x.reason].filter(Boolean).join(" · "), PRIORITY(x.priority, tr)),
    );
  } else {
    const c = r.content;
    c.best_audience.forEach((b) => add(tr("Where it works best", "কোথায় ভালো চলছে"), b.dimension, b.finding));
    if (c.video_analysis) add(tr("Video", "ভিডিও"), c.video_analysis);
    if (c.website_analysis) add(tr("Website", "ওয়েবসাইট"), c.website_analysis);
    c.problems.forEach((p) => add(tr("Problems", "সমস্যা"), p.title, p.evidence));
    c.solutions.forEach((s) => add(tr("What to do", "এখন কী করবে"), s.action, s.reason, PRIORITY(s.priority, tr)));
  }

  // শুরুর BOM থাকলে Excel বাংলা ঠিকমতো দেখায়
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function reportFileName(r: FullReport) {
  const name = r.kind === "campaign" ? r.campaignName : r.accountName;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || r.kind;
  return `hook-${r.kind}-${slug}-${(r.date_to ?? r.created_at).slice(0, 10)}-${r.shownLocale}`;
}
