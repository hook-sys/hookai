import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { getUserPlan } from "@/lib/plans";
import { getReport, isReportKind, reportFileName, reportToCsv } from "@/lib/reports";

// রিপোর্ট CSV হিসেবে নামানো (Excel ও Google Sheets-এ খোলে)
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isReportKind(kind)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const plan = await getUserPlan(supabase, user.id);
  if (!plan.exportReports) return new NextResponse("Export isn't included in your plan", { status: 403 });

  const report = await getReport(supabase, user.id, kind, id);
  if (!report) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(reportToCsv(report, await getTr()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(report)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
