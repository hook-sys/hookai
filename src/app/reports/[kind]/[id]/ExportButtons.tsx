"use client";

import Link from "next/link";
import { FileDown, Lock, Printer } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui";

// PDF: ব্রাউজারের প্রিন্ট থেকে "Save as PDF"। এতে বাংলা অক্ষর সঠিকভাবে জোড়া লাগে, যা সার্ভারে বানানো PDF-এ প্রায়ই ভাঙে।
export default function ExportButtons({ csvHref, allowed }: { csvHref: string; allowed: boolean }) {
  const tr = useTr();
  if (!allowed) {
    return (
      <Link href="/settings#plan" className={buttonClass("secondary")} title={tr("PDF and CSV export start on the Solo plan", "PDF ও CSV এক্সপোর্ট Solo প্ল্যান থেকে")}>
        <Lock className="size-4" aria-hidden />
        {tr("Export (Solo and up)", "এক্সপোর্ট (Solo থেকে)")}
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => window.print()} className={buttonClass("primary")}>
        <Printer className="size-4" aria-hidden />
        {tr("Download PDF", "PDF নামাও")}
      </button>
      <a href={csvHref} download className={buttonClass("secondary")}>
        <FileDown className="size-4" aria-hidden />
        {tr("Download CSV", "CSV নামাও")}
      </a>
    </>
  );
}
