import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Lightbulb, Radar, Rocket, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr, type Tr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { currentClient } from "@/lib/clients";
import type { SiteSnapshot } from "@/lib/competitors/site";
import type { LibAnalysis } from "@/lib/competitors/adlib";
import type { ResearchReport } from "@/lib/competitors/report";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass, cn } from "@/components/ui";
import { AddCompetitorForm, PasteAdsForm, ReportButton, RefreshSiteButton } from "./CompetitorForms";
import { deleteCompetitor } from "./actions";

// AI রিপোর্টে সময় লাগে; ওয়েবসাইট দেখাতেও
export const maxDuration = 300;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Competitors", "প্রতিযোগী") };
}

const money = (v: number) => `৳${Math.round(v).toLocaleString("en-US")}`;

function adLibraryUrl(query: string | null, name: string) {
  const q = (query || name).trim();
  if (/^https:\/\/www\.facebook\.com\/ads\/library\//.test(q)) return q;
  if (/^\d{6,25}$/.test(q)) return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BD&view_all_page_id=${q}`;
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BD&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;
}

function SiteBlock({ site, status, error, tr }: { site: SiteSnapshot | null; status: string | null; error: string | null; tr: Tr }) {
  if (status === "blocked") return <p className="text-xs text-amber-300">{tr("This website blocks automatic checks; use the Ad Library part.", "এই ওয়েবসাইট স্বয়ংক্রিয় দেখা আটকায়; Ad Library অংশটা ব্যবহার করো।")}</p>;
  if (status === "error") return <p className="text-xs text-red-400">{error}</p>;
  if (!site) return <p className="text-xs text-zinc-500">{tr("Not checked yet.", "এখনো দেখা হয়নি।")}</p>;
  const priced = site.products.filter((p) => p.price !== null).map((p) => p.price!);
  const sale = site.products.filter((p) => p.regular);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-zinc-300">
        <span>{tr(`${site.products.length} products`, `${site.products.length}টা প্রোডাক্ট`)}</span>
        {priced.length > 0 && <span>{`${money(Math.min(...priced))} – ${money(Math.max(...priced))}`}</span>}
        <span>{tr(`${sale.length} on discount`, `${sale.length}টায় ছাড়`)}</span>
        <span className="text-zinc-500">{site.platform}</span>
      </div>
      {site.offers.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {site.offers.slice(0, 6).map((o) => (
            <li key={o} className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-[11px] text-amber-200">
              {o}
            </li>
          ))}
        </ul>
      )}
      {sale.length > 0 && (
        <p className="text-xs text-zinc-400">
          {tr("Biggest discounts: ", "সবচেয়ে বড় ছাড়: ")}
          {[...sale]
            .sort((a, b) => b.regular! / (b.price ?? 1) - a.regular! / (a.price ?? 1))
            .slice(0, 3)
            .map((p) => `${p.name} ${money(p.price!)} (${money(p.regular!)})`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function AdsBlock({ ads, tr }: { ads: LibAnalysis | null; tr: Tr }) {
  if (!ads) return <p className="text-xs text-zinc-500">{tr("Paste their Ad Library page to see their ads and winners.", "তাদের বিজ্ঞাপন আর winner দেখতে Ad Library পাতা পেস্ট করো।")}</p>;
  const active = ads.ads.filter((a) => a.active);
  const winners = [...ads.ads].filter((a) => a.label === "winner").sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [tr("Active ads", "চালু বিজ্ঞাপন"), `${active.length}${ads.total_results && ads.total_results > ads.ads.length ? ` / ~${ads.total_results}` : ""}`],
          [tr("New in 7 days", "৭ দিনে নতুন"), String(ads.new_last_7d)],
          [tr("Avg. days running", "গড়ে কত দিন চলছে"), ads.avg_days === null ? "—" : String(ads.avg_days)],
          [tr("Spend (rough guess)", "খরচ (মোটা আন্দাজ)"), ads.spend_estimate ? `$${ads.spend_estimate.low}–${ads.spend_estimate.high}/${tr("day", "দিন")}` : "—"],
        ].map(([l, v]) => (
          <div key={l}>
            <div className="text-[11px] text-zinc-500">{l}</div>
            <div className="font-semibold text-zinc-100">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">
        {tr(
          "Spend is not public; the guess uses how many ads run, their order by reach and versions.",
          "খরচ Meta প্রকাশ করে না; আন্দাজটা চালু বিজ্ঞাপনের সংখ্যা, দেখানোর ক্রম আর ভার্সন দেখে।",
        )}
        {" · "}
        {tr(`${ads.formats.video} video, ${ads.formats.image} image`, `${ads.formats.video}টা ভিডিও, ${ads.formats.image}টা ছবি`)}
        {ads.pages.length > 1 && ` · ${ads.pages.map((p) => `${p.name} (${p.ads})`).join(", ")}`}
      </p>
      {winners.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-emerald-300">{tr("Likely winners (long-running, most shown)", "সম্ভাব্য winner (অনেক দিন চলছে, বেশি দেখানো)")}</div>
          {winners.map((w) => (
            <div key={w.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <Badge tone="success">{w.score}</Badge>
                <span>{tr(`${w.days ?? "?"} days`, `${w.days ?? "?"} দিন`)}</span>
                {w.versions > 1 && <span>{tr(`${w.versions} versions`, `${w.versions}টা ভার্সন`)}</span>}
                <span>{w.video ? tr("video", "ভিডিও") : tr("image", "ছবি")}</span>
                {w.page && <span>{w.page}</span>}
                <a href={`https://www.facebook.com/ads/library/?id=${w.id}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-indigo-300 hover:underline">
                  {tr("Open", "খোলো")} <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
              <p className="line-clamp-3 text-xs whitespace-pre-line text-zinc-200">{w.body}</p>
              {(w.headline || w.cta) && <p className="mt-1 text-[11px] text-zinc-500">{[w.headline, w.cta].filter(Boolean).join(" · ")}</p>}
            </div>
          ))}
        </div>
      )}
      {ads.products.length > 0 && (
        <p className="text-xs text-zinc-400">
          {tr("Most advertised links: ", "সবচেয়ে বেশি বিজ্ঞাপন দেওয়া লিংক: ")}
          {ads.products.slice(0, 4).map((p) => `${p.link.split("/").slice(-1)[0] || p.link} (${p.ads})`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function ReportView({ r, created, tr }: { r: ResearchReport; created: string; tr: Tr }) {
  const launchHref = (i: ResearchReport["ad_ideas"][number]) =>
    `/launch?primary=${encodeURIComponent(i.primary_text)}&headline=${encodeURIComponent(i.headline)}&description=${encodeURIComponent(i.description)}`;
  return (
    <div className="flex flex-col gap-5 p-5 text-sm">
      <p className="text-xs text-zinc-500">{created}</p>
      <p className="leading-relaxed text-zinc-200">{r.summary}</p>
      {r.price_comparison && (
        <div>
          <h3 className="mb-1 font-semibold text-zinc-100">{tr("Prices and offers", "দাম আর অফার")}</h3>
          <p className="text-zinc-300">{r.price_comparison}</p>
        </div>
      )}
      {r.competitors.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {r.competitors.map((c) => (
            <div key={c.name} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="font-semibold text-zinc-100">{c.name}</div>
              <p className="mt-1 text-xs text-zinc-400">{c.positioning}</p>
              <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                {c.strengths?.map((s) => (
                  <li key={s} className="flex gap-1.5 text-emerald-300">
                    <TrendingUp className="mt-0.5 size-3 shrink-0" aria-hidden /> {s}
                  </li>
                ))}
                {c.weaknesses?.map((s) => (
                  <li key={s} className="flex gap-1.5 text-red-300">
                    <TrendingDown className="mt-0.5 size-3 shrink-0" aria-hidden /> {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {r.winning_angles.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-zinc-100">{tr("What's working for them", "তাদের যা কাজ করছে")}</h3>
          <ul className="flex flex-col gap-2">
            {r.winning_angles.map((a) => (
              <li key={a.angle} className="text-xs">
                <span className="font-medium text-zinc-100">{a.angle}</span>
                <span className="text-zinc-400"> · {a.why}</span>
                {a.example && <span className="block text-zinc-500">“{a.example}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.gaps.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-zinc-100">
            <Lightbulb className="size-4 text-amber-300" aria-hidden />
            {tr("Opportunities for us", "আমাদের সুযোগ")}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-zinc-300">
            {r.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {r.ad_ideas.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-zinc-100">{tr("Ad ideas for our client", "আমাদের ক্লায়েন্টের জন্য বিজ্ঞাপনের আইডিয়া")}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {r.ad_ideas.map((i) => (
              <div key={i.title} className="flex flex-col gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-3">
                <div className="text-xs font-semibold text-indigo-200">{i.title}</div>
                <div className="text-[11px] text-zinc-500">{i.angle}</div>
                <p className="text-xs whitespace-pre-line text-zinc-200">{i.primary_text}</p>
                <p className="text-xs text-zinc-400">
                  <span className="font-medium text-zinc-200">{i.headline}</span>
                  {i.description && ` · ${i.description}`}
                </p>
                <Link href={launchHref(i)} className={buttonClass("secondary", "mt-auto self-start px-3 py-1.5 text-xs")}>
                  <Rocket className="size-3.5" aria-hidden />
                  {tr("Make an ad from this", "এই আইডিয়ায় বিজ্ঞাপন")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
      {r.next_steps.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-zinc-100">{tr("Next steps", "পরের কাজ")}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-zinc-300">
            {r.next_steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default async function CompetitorsPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();
  const { client } = await currentClient(supabase, user.id);
  if (!client) {
    return (
      <AppShell active="competitors">
        <PageHeader title={tr("Competitors", "প্রতিযোগী")} />
        <EmptyState icon={Radar} title={tr("Pick a client", "একটা ক্লায়েন্ট বাছো")} text={tr("Competitors are kept per client.", "প্রতিযোগী প্রতিটা ক্লায়েন্টের আলাদা।")} />
      </AppShell>
    );
  }

  const [{ data: comps }, { data: report }] = await Promise.all([
    supabase.from("competitors").select("id, name, website_url, ad_library_query, site_status, last_checked_at, last_error").eq("user_id", user.id).eq("client_id", client.id).order("created_at"),
    supabase.from("competitor_reports").select("content, created_at").eq("user_id", user.id).eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ids = (comps ?? []).map((c) => c.id);
  // প্রতিটার সর্বশেষ ছবি (ওয়েবসাইট আর বিজ্ঞাপন) আর সাম্প্রতিক বদল
  const [{ data: snaps }, { data: changes }] = await Promise.all([
    ids.length
      ? supabase.from("competitor_snapshots").select("competitor_id, kind, data, created_at").in("competitor_id", ids).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as { competitor_id: string; kind: string; data: unknown; created_at: string }[] }),
    ids.length
      ? supabase.from("competitor_changes").select("competitor_id, kind, title, detail, created_at").in("competitor_id", ids).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as { competitor_id: string; kind: string; title: string; detail: string | null; created_at: string }[] }),
  ]);
  const latest = (id: string, kind: string) => (snaps ?? []).find((s) => s.competitor_id === id && s.kind === kind);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const nameOf = new Map((comps ?? []).map((c) => [c.id, c.name]));

  return (
    <AppShell active="competitors">
      <PageHeader
        title={tr(`Competitors · ${client.name}`, `প্রতিযোগী · ${client.name}`)}
        description={tr(
          "Websites are checked daily for products, prices and offers. Paste their Ad Library page to see their ads. Then get an AI report with ideas.",
          "ওয়েবসাইট প্রতিদিন নিজে দেখা হয়: প্রোডাক্ট, দাম, অফার। বিজ্ঞাপন দেখতে Ad Library পাতা পেস্ট করো। তারপর আইডিয়াসহ AI রিপোর্ট।",
        )}
        actions={<ReportButton hasReport={Boolean(report)} />}
      />

      <Card className="mb-6">
        <CardHeader icon={Radar} title={tr("Add a competitor", "প্রতিযোগী যোগ করো")} />
        <div className="p-5">
          <AddCompetitorForm />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {(comps ?? []).length === 0 && (
            <div className="glass-panel rounded-3xl p-8 text-center text-sm text-zinc-400">{tr("No competitors yet. Add 3–5 above.", "এখনো কোনো প্রতিযোগী নেই। উপরে ৩–৫টা যোগ করো।")}</div>
          )}
          {(comps ?? []).map((c) => {
            const site = latest(c.id, "site");
            const ads = latest(c.id, "ads");
            return (
              <article key={c.id} className="glass-panel flex flex-col gap-4 rounded-3xl p-5">
                <header className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-zinc-50">{c.name}</h2>
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 hover:text-white">
                      {c.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  )}
                  <form action={deleteCompetitor} className="ml-auto">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" aria-label={tr("Remove competitor", "প্রতিযোগী সরাও")} className="rounded-full p-1.5 text-zinc-500 hover:bg-white/10 hover:text-red-300">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </form>
                </header>

                <section className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{tr("Website", "ওয়েবসাইট")}</h3>
                    {c.last_checked_at && <span className="text-[11px] text-zinc-500">{when(c.last_checked_at)}</span>}
                  </div>
                  {c.website_url ? (
                    <>
                      <SiteBlock site={(site?.data as SiteSnapshot) ?? null} status={c.site_status} error={c.last_error} tr={tr} />
                      <RefreshSiteButton id={c.id} />
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500">{tr("No website added.", "ওয়েবসাইট দেওয়া হয়নি।")}</p>
                  )}
                </section>

                <section className="flex flex-col gap-2 border-t border-white/[0.07] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{tr("Ads (Ad Library)", "বিজ্ঞাপন (Ad Library)")}</h3>
                    {ads && <span className="text-[11px] text-zinc-500">{when(ads.created_at)}</span>}
                  </div>
                  <AdsBlock ads={(ads?.data as LibAnalysis) ?? null} tr={tr} />
                  <div className="flex flex-wrap items-start gap-2">
                    <a href={adLibraryUrl(c.ad_library_query, c.name)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "px-3 py-1.5 text-xs")}>
                      {tr("Open Ad Library", "Ad Library খোলো")} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <PasteAdsForm id={c.id} />
                  </div>
                </section>
              </article>
            );
          })}
        </div>

        <aside className="xl:sticky xl:top-28 xl:self-start">
          <section className="glass-panel rounded-3xl p-4">
            <h2 className="px-1 text-sm font-semibold text-zinc-100">{tr("What changed", "কী বদলাল")}</h2>
            {(changes ?? []).length === 0 ? (
              <p className="px-1 py-4 text-xs text-zinc-500">{tr("Changes appear here after the next checks.", "পরের দেখাগুলোর পর বদল এখানে দেখাবে।")}</p>
            ) : (
              <ul className="mt-3 flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
                {(changes ?? []).map((ch, i) => (
                  <li key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-xs">
                    <div className="text-[11px] text-zinc-500">
                      {nameOf.get(ch.competitor_id)} · {when(ch.created_at)}
                    </div>
                    <div className={cn("mt-0.5", ch.kind === "price_down" || ch.kind === "sale_start" ? "text-amber-200" : "text-zinc-100")}>{ch.title}</div>
                    {ch.detail && <div className="mt-0.5 line-clamp-2 text-zinc-500">{ch.detail}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {report && (
        <Card className="mt-6">
          <CardHeader icon={Lightbulb} title={tr("AI research report", "AI গবেষণা রিপোর্ট")} />
          <ReportView r={report.content as ResearchReport} created={when(report.created_at)} tr={tr} />
        </Card>
      )}
    </AppShell>
  );
}
