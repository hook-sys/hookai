"use server";

import { revalidatePath } from "next/cache";
import { loadCampaignAnalysis } from "@/lib/insights/campaign";
import { AiError } from "@/lib/ai/providers";
import { generateCampaignReport, type StoredCampaignReport } from "@/lib/ai/campaignReport";
import { getTr } from "@/lib/i18n-server";
import { loadCampaignContext } from "./load";

export type ReportState =
  | { ok: true; report: StoredCampaignReport }
  | { ok: false; error: string }
  | null;

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" && v ? v : undefined;
};

export async function generateCampaignReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const campaignId = field(formData, "campaignId") ?? "";
  const tr = await getTr();

  try {
    // পেজের মতো একই যাচাই: ক্যাম্পেইনটি এই ব্যবহারকারীর নির্বাচিত Ad Account-এর
    const c = await loadCampaignContext(campaignId, {
      since: field(formData, "since"),
      until: field(formData, "until"),
    });
    if (!c.campaign) {
      return {
        ok: false,
        error: tr(
          "This campaign spent nothing in this period, so there's nothing to analyze.",
          "এই সময়ে ক্যাম্পেইনে খরচ হয়নি, তাই বিশ্লেষণ করার মতো ডাটা নেই।",
        ),
      };
    }

    const analysis = await loadCampaignAnalysis(c.ctx, c.campaign, { since: c.since, until: c.until }, c.today, c.tr);
    const report = await generateCampaignReport(
      c.supabase,
      c.user.id,
      c.accountId,
      analysis,
      c.currency,
      { since: c.since, until: c.until },
      c.today,
      c.locale,
    );
    revalidatePath(`/dashboard/campaigns/${campaignId}`);
    return { ok: true, report };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    // notFound/redirect Next.js নিজে সামলায়
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("campaign report failed", err instanceof Error ? err.message : err);
    return { ok: false, error: tr("Couldn't create the report. Please try again shortly.", "রিপোর্ট তৈরি করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করো।") };
  }
}
