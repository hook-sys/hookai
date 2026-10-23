"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Globe,
  Lightbulb,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { useTr } from "@/components/I18nProvider";
import type { AiSummary, Priority } from "@/lib/ai/summary";
import type { CampaignReport } from "@/lib/ai/campaignReport";

// রিপোর্টের লেখা দেখানোর অংশ: ড্যাশবোর্ড, ক্যাম্পেইন পেজ আর "রিপোর্ট" পেজ একই নকশা ব্যবহার করে

const PRIORITY_TONE: Record<Priority, "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

function usePriorityLabel() {
  const tr = useTr();
  return (p: Priority) =>
    p === "high" ? tr("Urgent", "জরুরি") : p === "medium" ? tr("Important", "গুরুত্বপূর্ণ") : tr("Can wait", "পরে করলেও চলে");
}

function Section({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <Icon className="size-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

function List({ title, items, icon: Icon, iconClass }: { title: string; items: string[]; icon: typeof CheckCircle2; iconClass: string }) {
  if (items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <Icon className={`mt-0.5 size-4 shrink-0 ${iconClass}`} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Headline({ headline, overview }: { headline: string; overview: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{headline}</p>
      {overview && <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{overview}</p>}
    </div>
  );
}

export function SummaryContent({ content }: { content: AiSummary }) {
  const tr = useTr();
  const priority = usePriorityLabel();
  return (
    <div className="flex flex-col gap-6">
      <Headline headline={content.headline} overview={content.overview} />
      <div className="grid gap-6 md:grid-cols-2">
        <List
          title={tr("Working well", "ভালো চলছে")}
          items={content.highlights}
          icon={CheckCircle2}
          iconClass="text-emerald-600 dark:text-emerald-400"
        />
        <List
          title={tr("Needs attention", "নজর দেওয়া দরকার")}
          items={content.concerns}
          icon={AlertTriangle}
          iconClass="text-amber-600 dark:text-amber-400"
        />
      </div>
      {content.recommendations.length > 0 && (
        <Section icon={Lightbulb} title={tr("What to do now", "এখন কী করবে")}>
          <ol className="flex flex-col gap-3">
            {content.recommendations.map((r, i) => (
              <li key={i} className="break-inside-avoid rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.action}</span>
                  <Badge tone={PRIORITY_TONE[r.priority]}>{priority(r.priority)}</Badge>
                </div>
                {r.campaign && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {tr("Campaign", "ক্যাম্পেইন")}: {r.campaign}
                  </p>
                )}
                {r.reason && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.reason}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

export function CampaignReportContent({ content: c }: { content: CampaignReport }) {
  const tr = useTr();
  const priority = usePriorityLabel();
  return (
    <div className="flex flex-col gap-6">
      <Headline headline={c.headline} overview={c.overview} />
      {c.best_audience.length > 0 && (
        <Section icon={Users} title={tr("Where it works best", "কোথায় ভালো চলছে")}>
          <ul className="grid gap-2 md:grid-cols-2">
            {c.best_audience.map((b, i) => (
              <li key={i} className="break-inside-avoid rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                {b.dimension && <Badge tone="brand">{b.dimension}</Badge>}
                <p className="mt-1.5 text-zinc-700 dark:text-zinc-300">{b.finding}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(c.video_analysis || c.website_analysis) && (
        <div className="grid gap-6 md:grid-cols-2">
          {c.video_analysis && (
            <Section icon={Clapperboard} title={tr("Where viewers leave the video", "ভিডিওতে কোথায় মানুষ চলে যাচ্ছে")}>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.video_analysis}</p>
            </Section>
          )}
          {c.website_analysis && (
            <Section icon={Globe} title={tr("Where visitors leave the website", "ওয়েবসাইটে কোন ধাপে মানুষ চলে যাচ্ছে")}>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.website_analysis}</p>
            </Section>
          )}
        </div>
      )}
      {c.problems.length > 0 && (
        <Section icon={AlertTriangle} title={tr("Problems", "সমস্যা")}>
          <ul className="flex flex-col gap-2">
            {c.problems.map((p, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.title}</span>
                {p.evidence && <span className="text-zinc-600 dark:text-zinc-400"> · {p.evidence}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.solutions.length > 0 && (
        <Section icon={Lightbulb} title={tr("What to do now", "সমাধান: এখন কী করবে")}>
          <ol className="flex flex-col gap-3">
            {c.solutions.map((s, i) => (
              <li key={i} className="break-inside-avoid rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.action}</span>
                  <Badge tone={PRIORITY_TONE[s.priority]}>{priority(s.priority)}</Badge>
                </div>
                {s.reason && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.reason}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
