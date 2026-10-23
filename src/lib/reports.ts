import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiSummary } from "@/lib/ai/summary";
import type { CampaignReport } from "@/lib/ai/campaignReport";
import { enTr, type Tr } from "@/lib/i18n";

// সব AI রিপোর্ট (অ্যাকাউন্টের সারসংক্ষেপ ও ক্যাম্পেইন রিপোর্ট) ডাটাবেসেই জমা থাকে।
// এখানে সেগুলো এক তালিকায় আনা, একটি খোলা, আর CSV বানানো হয়।

export type ReportKind = "summary" | "campaign";

export function isReportKind(value: unknown): value is ReportKind {
  return value === "summary" || value === "campaign";
}

export type ReportListItem = {
  kind: ReportKind;
  id: string;
  title: string; // অ্যাকাউন্ট বা ক্যাম্পেইনের নাম
  headline: string;
  date_from: string | null;
  date_to: string | null;
  model: string;
  created_at: string;
};

export type FullReport =
  | { kind: "summary"; id: string; title: string; adAccountId: string; date_from: string | null; date_to: string | null; model: string; created_at: string; content: AiSummary }
  | { kind: "campaign"; id: string; title: string; adAccountId: string; date_from: string; date_to: string; model: string; created_at: string; content: CampaignReport };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ad Account-এর নাম (শুধু বর্তমানে বাছাই করা অ্যাকাউন্টের নাম জমা থাকে; বাকিগুলোর ID দেখায়)
async function accountNames(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("meta_connections")
    .select("selected_ad_account_id, selected_ad_account_name")
    .eq("user_id", userId)
    .maybeSingle();
  const map = new Map<string, string>();
  if (data?.selected_ad_account_id && data.selected_ad_account_name) {
    map.set(data.selected_ad_account_id, data.selected_ad_account_name);
  }
  return map;
}

export async function listReports(
  supabase: SupabaseClient,
  userId: string,
  kind: ReportKind | null,
  limit = 100,
): Promise<ReportListItem[]> {
  const names = await accountNames(supabase, userId);
  const [summaries, campaigns] = await Promise.all([
    kind === "campaign"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("ai_summaries")
          .select("id, ad_account_id, date_from, date_to, model, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
    kind === "summary"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("campaign_reports")
          .select("id, campaign_name, campaign_id, date_from, date_to, model, content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
  ]);

  const items: ReportListItem[] = [
    ...((summaries.data ?? []) as Record<string, unknown>[]).map((s) => ({
      kind: "summary" as const,
      id: String(s.id),
      title: (s.content as AiSummary)?.account_name ?? names.get(String(s.ad_account_id)) ?? String(s.ad_account_id),
      headline: String((s.content as AiSummary)?.headline ?? ""),
      date_from: (s.date_from as string) ?? null,
      date_to: (s.date_to as string) ?? null,
      model: String(s.model),
      created_at: String(s.created_at),
    })),
    ...((campaigns.data ?? []) as Record<string, unknown>[]).map((c) => ({
      kind: "campaign" as const,
      id: String(c.id),
      title: String(c.campaign_name ?? c.campaign_id),
      headline: String((c.content as CampaignReport)?.headline ?? ""),
      date_from: (c.date_from as string) ?? null,
      date_to: (c.date_to as string) ?? null,
      model: String(c.model),
      created_at: String(c.created_at),
    })),
  ];
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// RLS নিশ্চিত করে শুধু নিজের রিপোর্ট পাওয়া যায়; তবু user_id মিলিয়ে নেওয়া হয়
export async function getReport(
  supabase: SupabaseClient,
  userId: string,
  kind: ReportKind,
  id: string,
): Promise<FullReport | null> {
  if (!UUID_PATTERN.test(id)) return null;
  if (kind === "summary") {
    const { data } = await supabase
      .from("ai_summaries")
      .select("id, ad_account_id, date_from, date_to, model, content, created_at")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const names = await accountNames(supabase, userId);
    return {
      kind,
      id: data.id,
      title: (data.content as AiSummary)?.account_name ?? names.get(data.ad_account_id) ?? data.ad_account_id,
      adAccountId: data.ad_account_id,
      date_from: data.date_from,
      date_to: data.date_to,
      model: data.model,
      created_at: data.created_at,
      content: data.content as AiSummary,
    };
  }
  const { data } = await supabase
    .from("campaign_reports")
    .select("id, ad_account_id, campaign_id, campaign_name, date_from, date_to, model, content, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    kind,
    id: data.id,
    title: data.campaign_name ?? data.campaign_id,
    adAccountId: data.ad_account_id,
    date_from: data.date_from,
    date_to: data.date_to,
    model: data.model,
    created_at: data.created_at,
    content: data.content as CampaignReport,
  };
}

// ---------- CSV ----------

const PRIORITY = (p: string, tr: Tr) =>
  p === "high" ? tr("Urgent", "জরুরি") : p === "medium" ? tr("Important", "গুরুত্বপূর্ণ") : tr("Can wait", "পরে করলেও চলে");

// Excel-এ সূত্র হিসেবে চলে যাওয়া আটকাতে =, +, -, @ দিয়ে শুরু হলে আগে ' বসানো হয়
function cell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function reportToCsv(r: FullReport, tr: Tr = enTr) {
  const rows: string[][] = [[tr("Section", "অংশ"), tr("Item", "বিষয়"), tr("Detail", "বিস্তারিত"), tr("Priority", "গুরুত্ব")]];
  const add = (section: string, item: string, detail = "", priority = "") => rows.push([section, item, detail, priority]);

  add(tr("Report", "রিপোর্ট"), r.kind === "summary" ? tr("AI summary", "AI সারসংক্ষেপ") : tr("Campaign report", "ক্যাম্পেইন রিপোর্ট"), r.title);
  add(tr("Period", "সময়"), `${r.date_from ?? ""} – ${r.date_to ?? ""}`);
  add(tr("Created", "তৈরি"), new Date(r.created_at).toISOString().replace("T", " ").slice(0, 16), r.model);
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
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function reportFileName(r: FullReport) {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || r.kind;
  return `hook-${r.kind}-${slug}-${(r.date_to ?? r.created_at).slice(0, 10)}`;
}
