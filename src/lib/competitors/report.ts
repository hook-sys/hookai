import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAiConfig } from "@/lib/ai/config";
import { AiError, generateText } from "@/lib/ai/providers";
import type { ClientProfile } from "@/lib/clientProfile";
import type { SiteSnapshot } from "./site";
import type { LibAnalysis } from "./adlib";

// AI গবেষণা রিপোর্ট: প্রতিযোগীদের দাম, অফার আর বেশি দিন চলা বিজ্ঞাপন বনাম আমাদের ক্লায়েন্ট,
// আর সেখান থেকে ক্লায়েন্টের নিজের বিজ্ঞাপনের আইডিয়া (নকল নয়, নিজের মতো করে)।

export type CompetitorInput = {
  name: string;
  site: SiteSnapshot | null;
  ads: LibAnalysis | null;
  changes: string[];
};

export type ResearchReport = {
  summary: string;
  competitors: { name: string; positioning: string; strengths: string[]; weaknesses: string[] }[];
  price_comparison: string;
  winning_angles: { angle: string; example: string; why: string }[];
  gaps: string[];
  ad_ideas: { title: string; angle: string; primary_text: string; headline: string; description: string }[];
  next_steps: string[];
};

const SYSTEM = `You are a senior performance marketer in Bangladesh doing competitor research for an agency client.
Write everything in natural Bangladeshi Bengali (brand and product names may stay in English).
Use ONLY the data given. Ad Library data is real (start dates, days running, versions, text, order by reach); spend is never public, so never state competitor spend, orders or revenue as facts.
Ads running many days with several versions are likely profitable ("winners"); new ads (< 7 days) are tests.
Ad ideas must be original for OUR client (no copying competitor text), follow Meta policy (no fake urgency, no personal attributes), and use only facts from our client's profile; leave prices out if unknown.
Return ONLY one JSON object:
{"summary": string (4-6 sentences),
 "competitors": [{"name": string, "positioning": string, "strengths": string[], "weaknesses": string[]}],
 "price_comparison": string,
 "winning_angles": [{"angle": string, "example": string (short quote or paraphrase of their ad), "why": string}],
 "gaps": string[] (opportunities for our client),
 "ad_ideas": [{"title": string, "angle": string, "primary_text": string (hook first, <= 300 chars), "headline": string (<= 40 chars), "description": string (<= 30 chars)}] (exactly 5),
 "next_steps": string[] (3-5 concrete actions)}`;

const money = (v: number | null) => (v === null ? "?" : Math.round(v).toLocaleString("en-US"));

function siteText(s: SiteSnapshot | null) {
  if (!s) return "Website: not checked.";
  const priced = s.products.filter((p) => p.price !== null);
  const prices = priced.map((p) => p.price!) ;
  const onSale = s.products.filter((p) => p.regular);
  return [
    `Website (${s.platform}): ${s.products.length} products${prices.length ? `, price ${money(Math.min(...prices))}-${money(Math.max(...prices))}` : ""}, ${onSale.length} on discount.`,
    priced.slice(0, 20).map((p) => `- ${p.name}: ${money(p.price)}${p.regular ? ` (was ${money(p.regular)})` : ""}`).join("\n"),
    s.offers.length ? `Offers on site: ${s.offers.slice(0, 8).join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function adsText(a: LibAnalysis | null) {
  if (!a) return "Ad Library: not analysed.";
  const top = [...a.ads].sort((x, y) => y.score - x.score).slice(0, 10);
  return [
    `Ad Library: ${a.ads.filter((x) => x.active).length} active ads in the paste (${a.total_results ?? "?"} results), ${a.new_last_7d} started in the last 7 days, average ${a.avg_days ?? "?"} days running, ${a.formats.video} video / ${a.formats.image} image.`,
    `Pages: ${a.pages.map((p) => `${p.name} (${p.ads})`).join(", ")}. Buttons: ${a.ctas.map((c) => `${c.cta} (${c.ads})`).join(", ")}.`,
    "Top ads by winner score:",
    ...top.map((x) => `- [${x.label}, ${x.days ?? "?"} days, ${x.versions} versions, ${x.video ? "video" : "image"}] ${x.page ?? ""}: ${x.body.replace(/\s+/g, " ").slice(0, 280)}${x.headline ? ` | headline: ${x.headline}` : ""}${x.cta ? ` | ${x.cta}` : ""}`),
  ].join("\n");
}

export async function buildReport(
  supabase: SupabaseClient,
  input: { clientName: string; profile?: ClientProfile; clientSite: SiteSnapshot | null; competitors: CompetitorInput[] },
) {
  const cfg = await getActiveAiConfig(supabase, "report");
  let cost: number | null = null;
  const prompt = [
    `OUR CLIENT: ${input.clientName}`,
    input.profile?.about ? `Client facts and tone:\n${input.profile.about}` : "",
    `Our client's ${siteText(input.clientSite)}`,
    ...input.competitors.map((c, i) =>
      [`\nCOMPETITOR ${i + 1}: ${c.name}`, siteText(c.site), adsText(c.ads), c.changes.length ? `Recent changes: ${c.changes.slice(0, 8).join(" | ")}` : ""].filter(Boolean).join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n");
  const text = await generateText(cfg, {
    system: SYSTEM,
    prompt: prompt.slice(0, 60_000),
    maxTokens: 7000,
    onUsage: (u) => (cost = u.costUsd),
  });
  let report: ResearchReport;
  try {
    report = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as ResearchReport;
  } catch {
    throw new AiError("The AI's report couldn't be read. Try again.");
  }
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const clean: ResearchReport = {
    summary: String(report.summary ?? ""),
    competitors: arr<ResearchReport["competitors"][number]>(report.competitors).slice(0, 10),
    price_comparison: String(report.price_comparison ?? ""),
    winning_angles: arr<ResearchReport["winning_angles"][number]>(report.winning_angles).slice(0, 10),
    gaps: arr<string>(report.gaps).slice(0, 10),
    ad_ideas: arr<ResearchReport["ad_ideas"][number]>(report.ad_ideas).slice(0, 8),
    next_steps: arr<string>(report.next_steps).slice(0, 8),
  };
  return { report: clean, model: cfg.model, cost };
}
