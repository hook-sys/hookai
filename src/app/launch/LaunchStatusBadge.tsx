"use client";

import { useTr } from "@/components/I18nProvider";
import { Badge } from "@/components/ui";

const LABELS: Record<string, { tone: "neutral" | "success" | "warning" | "danger" | "brand"; en: string; bn: string }> = {
  draft: { tone: "neutral", en: "Draft", bn: "খসড়া" },
  creating: { tone: "brand", en: "Creating", bn: "তৈরি হচ্ছে" },
  waiting_video: { tone: "warning", en: "Video processing", bn: "ভিডিও প্রসেস হচ্ছে" },
  paused: { tone: "brand", en: "Ready, off", bn: "তৈরি, বন্ধ" },
  active: { tone: "success", en: "On", bn: "চালু" },
  failed: { tone: "danger", en: "Failed", bn: "ব্যর্থ" },
};

export function LaunchStatusBadge({ status }: { status: string }) {
  const tr = useTr();
  const l = LABELS[status] ?? LABELS.draft;
  return <Badge tone={l.tone}>{tr(l.en, l.bn)}</Badge>;
}
