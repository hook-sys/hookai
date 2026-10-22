import { AlertOctagon, AlertTriangle, BellRing, Check, ShieldCheck } from "lucide-react";
import { RECENT_DAYS } from "@/lib/alerts/rules";
import type { StoredAlert } from "@/lib/alerts/store";
import { Badge, Card, buttonClass, cn } from "@/components/ui";
import { dismissAlert } from "./actions";

export default function AlertsCard({ alerts }: { alerts: StoredAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        গত {RECENT_DAYS} দিনে কোনো সতর্কতা পাওয়া যায়নি। খরচ, ফলাফল ও CTR স্বাভাবিক আছে।
      </p>
    );
  }

  const high = alerts.filter((a) => a.severity === "high").length;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300">
            <BellRing className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">অ্যালার্ট</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              গত {RECENT_DAYS} দিনকে তার আগের ৭ দিনের সাথে তুলনা করে
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {high > 0 && <Badge tone="danger">{high}টি জরুরি</Badge>}
          <Badge>{alerts.length}টি</Badge>
        </div>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {alerts.map((a) => {
          const isHigh = a.severity === "high";
          const Icon = isHigh ? AlertOctagon : AlertTriangle;
          return (
            <li key={a.id} className="flex gap-3 px-5 py-4">
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  isHigh ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{a.title}</p>
                  <Badge tone={isHigh ? "danger" : "warning"}>{isHigh ? "জরুরি" : "নজর দাও"}</Badge>
                </div>
                {a.campaign_name && (
                  <p className="mt-0.5 text-xs text-zinc-500">ক্যাম্পেইন: {a.campaign_name}</p>
                )}
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{a.message}</p>
              </div>
              <form action={dismissAlert} className="shrink-0">
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={buttonClass("ghost", "px-2 py-1 text-xs")}>
                  <Check className="size-3.5" aria-hidden />
                  দেখেছি
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
