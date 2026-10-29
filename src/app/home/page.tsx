import { redirect } from "next/navigation";
import { ArrowRight, Check, CircleAlert, RefreshCw, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr, type Tr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { loadHome, type ClientRow, type Task, type Tone } from "@/lib/home";
import { openClient } from "@/app/settings/actions";
import AppShell from "@/components/AppShell";
import { PageHeader, buttonClass, cn, inputClass } from "@/components/ui";
import { dismissNotification, refreshHome, setTarget } from "./actions";

// অনেক Ad Account থেকে Meta-র হিসাব আনতে সময় লাগতে পারে
export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("All clients", "সব ক্লায়েন্ট") };
}

const TONE: Record<Tone, { dot: string; ring: string; en: string; bn: string }> = {
  red: { dot: "bg-red-400 shadow-[0_0_12px_rgb(248_113_113/0.8)]", ring: "border-red-400/30", en: "Needs you now", bn: "এখনই দেখো" },
  yellow: { dot: "bg-amber-300 shadow-[0_0_12px_rgb(252_211_77/0.7)]", ring: "border-amber-300/25", en: "Keep an eye", bn: "নজর রাখো" },
  green: { dot: "bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153/0.7)]", ring: "border-white/10", en: "All good", bn: "সব ঠিক" },
  gray: { dot: "bg-zinc-500", ring: "border-white/10", en: "Not set up", bn: "সেটআপ বাকি" },
};

function money(v: number, currency: string | null) {
  const n = v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(v >= 100 ? 0 : 2);
  return currency === "USD" ? `$${n}` : currency ? `${n} ${currency}` : n;
}

// গত ৮ দিনের খরচের ছোট রেখা
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 0.01);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,30 ${pts} 100,30`} fill="rgb(111 143 216 / 0.15)" stroke="none" />
      <polyline points={pts} fill="none" stroke="rgb(140 165 230)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// কোনো ক্লায়েন্টের পাতায় যাওয়ার বোতাম (ক্লায়েন্ট বদলে তারপর খোলে)
function Go({ clientId, accountId, next, children, primary = false }: { clientId: string; accountId?: string; next: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={openClient}>
      <input type="hidden" name="clientId" value={clientId} />
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={buttonClass(primary ? "primary" : "secondary", "px-3 py-1.5 text-xs")}>
        {children}
      </button>
    </form>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={cn("truncate text-lg font-semibold", tone === "bad" ? "text-red-300" : tone === "good" ? "text-emerald-300" : "text-zinc-50")}>{value}</div>
      {sub && <div className="truncate text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function ClientCard({ c, tr }: { c: ClientRow; tr: Tr }) {
  const t = TONE[c.tone];
  const change = c.spendYesterday > 0 ? Math.round(((c.spendToday - c.spendYesterday) / c.spendYesterday) * 100) : null;
  const over = c.target && c.costPerOrder ? c.costPerOrder > c.target : null;
  return (
    <article className={cn("glass-panel rounded-3xl border p-5", t.ring)}>
      <header className="flex flex-wrap items-center gap-3">
        <span className={cn("size-2.5 shrink-0 rounded-full", t.dot)} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-zinc-50">{c.name}</h2>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300">{tr(t.en, t.bn)}</span>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        <Stat
          label={tr("Spend today", "আজ খরচ")}
          value={money(c.spendToday, c.currency)}
          sub={tr(`Yesterday ${money(c.spendYesterday, c.currency)}`, `গতকাল ${money(c.spendYesterday, c.currency)}`) + (change !== null ? ` · ${change > 0 ? "+" : ""}${change}%` : "")}
        />
        <div className="min-w-0">
          <div className="text-[11px] text-zinc-500">{tr("7-day spend", "৭ দিনের খরচ")}</div>
          <div className="text-lg font-semibold text-zinc-50">{money(c.spend7, c.currency)}</div>
          <Spark values={c.spark} />
        </div>
        <Stat label={tr("Orders", "অর্ডার")} value={`${c.ordersToday}`} sub={tr(`today · ${c.orders7} in 7 days`, `আজ · ৭ দিনে ${c.orders7}`)} />
        <div className="min-w-0">
          <div className="text-[11px] text-zinc-500">{tr("Cost / order (7d)", "অর্ডারপ্রতি খরচ (৭ দিন)")}</div>
          <div className={cn("text-lg font-semibold", over === true ? "text-red-300" : over === false ? "text-emerald-300" : "text-zinc-50")}>
            {c.costPerOrder ? money(c.costPerOrder, c.currency) : "—"}
          </div>
          <form action={setTarget} className="mt-0.5 flex items-center gap-1">
            <input type="hidden" name="clientId" value={c.id} />
            <label className="text-[11px] text-zinc-500" htmlFor={`t-${c.id}`}>
              {tr("Target", "লক্ষ্য")}
            </label>
            <input
              id={`t-${c.id}`}
              name="target"
              inputMode="decimal"
              defaultValue={c.target ?? ""}
              placeholder="—"
              className={cn(inputClass, "h-6 w-16 rounded-lg px-1.5 py-0 text-xs")}
            />
            <button type="submit" aria-label={tr("Save target", "লক্ষ্য সংরক্ষণ")} className="rounded-md p-0.5 text-zinc-400 hover:bg-white/10 hover:text-white">
              <Check className="size-3.5" aria-hidden />
            </button>
          </form>
        </div>
        <Stat
          label={tr("Delivery rate (30d)", "ডেলিভারি রেট (৩০ দিন)")}
          value={c.deliveryRate === null ? "—" : `${c.deliveryRate}%`}
          tone={c.deliveryRate === null ? undefined : c.deliveryRate < 50 ? "bad" : c.deliveryRate >= 70 ? "good" : undefined}
        />
      </div>

      {c.reasons.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {c.reasons.slice(0, 4).map(([en, bn]) => (
            <li key={en} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300">
              {tr(en, bn)}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        <Go clientId={c.id} next="/dashboard" primary>
          {tr("Dashboard", "ড্যাশবোর্ড")} <ArrowRight className="size-3.5" aria-hidden />
        </Go>
        <Go clientId={c.id} next="/orders">{tr("Orders", "অর্ডার")}</Go>
        <Go clientId={c.id} next="/manage">{tr("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ")}</Go>
        <Go clientId={c.id} next="/launch">{tr("New ad", "নতুন বিজ্ঞাপন")}</Go>
        <span className="ml-auto truncate text-[11px] text-zinc-500">
          {c.accounts.length} {tr("ad account(s)", "টা Ad Account")}
        </span>
      </footer>
    </article>
  );
}

function TaskItem({ t, tr }: { t: Task; tr: Tr }) {
  const Icon = t.tone === "red" ? CircleAlert : TriangleAlert;
  return (
    <li className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "red" ? "text-red-300" : "text-amber-300")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-zinc-500">{t.clientName}</div>
        <div className="text-sm text-zinc-100">{tr(...t.title)}</div>
        {t.detail && <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{t.detail}</div>}
        <div className="mt-2 flex items-center gap-2">
          <Go clientId={t.clientId} accountId={t.accountId} next={t.href}>
            {tr("Open", "খোলো")}
          </Go>
          {t.notificationId && (
            <form action={dismissNotification}>
              <input type="hidden" name="id" value={t.notificationId} />
              <button type="submit" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="size-3" aria-hidden />
                {tr("Done", "দেখা হয়েছে")}
              </button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function HomePage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // এই পাতা মালিকের; অন্য কেউ এলে সাধারণ ড্যাশবোর্ডে
  if (!(await isCurrentUserAdmin(supabase))) redirect("/dashboard");

  const { data: conn } = await supabase.from("meta_connections").select("access_token_encrypted").eq("user_id", user.id).maybeSingle();
  const { rows, tasks } = await loadHome(supabase, user.id, conn?.access_token_encrypted ? decrypt(conn.access_token_encrypted) : null);

  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const cur = currencies.length === 1 ? currencies[0] : null;
  const sum = (f: (r: ClientRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const red = rows.filter((r) => r.tone === "red").length;
  const yellow = rows.filter((r) => r.tone === "yellow").length;

  return (
    <AppShell active="home">
      <PageHeader
        title={tr("All clients", "সব ক্লায়েন্ট")}
        description={tr(
          `${rows.length} clients · Meta numbers refresh every 15 minutes`,
          `${rows.length}টা ক্লায়েন্ট · Meta-র হিসাব ১৫ মিনিট পর পর নতুন হয়`,
        )}
        actions={
          <form action={refreshHome}>
            <button type="submit" className={buttonClass("secondary")}>
              <RefreshCw className="size-4" aria-hidden />
              {tr("Refresh", "রিফ্রেশ")}
            </button>
          </form>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={tr("Summary", "সারাংশ")}>
        {[
          [tr("Spend today, all clients", "আজ মোট খরচ"), cur || currencies.length === 0 ? money(sum((r) => r.spendToday), cur) : tr("mixed currencies", "ভিন্ন মুদ্রা")],
          [tr("Spend, last 7 days", "গত ৭ দিনে খরচ"), cur || currencies.length === 0 ? money(sum((r) => r.spend7), cur) : "—"],
          [tr("Orders today", "আজ অর্ডার"), String(sum((r) => r.ordersToday))],
          [tr("Need attention", "নজর দরকার"), tr(`${red} red · ${yellow} yellow`, `${red} লাল · ${yellow} হলুদ`)],
        ].map(([label, value]) => (
          <div key={label} className="glass-panel lg-lens rounded-3xl px-5 py-4">
            <div className="text-xs text-zinc-400">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-50">{value}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {rows.length === 0 && (
            <div className="glass-panel rounded-3xl p-8 text-center text-sm text-zinc-400">
              {tr("No clients yet. Add one on the Clients page.", "এখনো কোনো ক্লায়েন্ট নেই। ক্লায়েন্ট পাতা থেকে যোগ করো।")}
            </div>
          )}
          {rows.map((c) => (
            <ClientCard key={c.id} c={c} tr={tr} />
          ))}
        </div>

        <aside className="xl:sticky xl:top-28 xl:self-start">
          <section className="glass-panel rounded-3xl p-4">
            <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-zinc-100">
              {tr("Today's to-do", "আজ যা দেখতে হবে")}
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-zinc-300">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
              <p className="flex items-center gap-2 px-1 py-6 text-sm text-emerald-300">
                <Check className="size-4" aria-hidden />
                {tr("All clear. Nothing needs you right now.", "সব ঠিক আছে। এখন কিছু দেখার নেই।")}
              </p>
            ) : (
              <ul className="mt-3 flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
                {tasks.map((t) => (
                  <TaskItem key={t.key} t={t} tr={tr} />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
