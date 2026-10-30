// Ad Library-র পাতা কপি করে পেস্ট করা লেখা থেকে বিজ্ঞাপনের তালিকা আর হিসাব।
// সত্যি তথ্য: কবে শুরু, কত দিন চলছে, কতগুলো ভার্সন, কোন লিংক, লেখা, বাটন, আর তালিকায় ক্রম
// (Ad Library ডিফল্টে সবচেয়ে বেশি দেখানো বিজ্ঞাপন আগে দেখায়)। খরচ Meta প্রকাশ করে না, তাই শুধু মোটা আন্দাজ।

export type LibAd = {
  id: string;
  active: boolean;
  started: string | null; // YYYY-MM-DD
  days: number | null;
  page: string | null;
  body: string;
  domain: string | null;
  headline: string | null;
  cta: string | null;
  versions: number; // ১ = একটাই
  video: boolean;
  links: string[];
  rank: number; // পেস্টের ক্রম (০ = সবচেয়ে বেশি দেখানো)
  score: number; // ০-১০০, "winner" হওয়ার সম্ভাবনা
  label: "winner" | "steady" | "testing";
};

export type LibAnalysis = {
  total_results: number | null;
  ads: LibAd[];
  pages: { name: string; ads: number }[];
  products: { link: string; ads: number }[];
  ctas: { cta: string; ads: number }[];
  formats: { video: number; image: number };
  new_last_7d: number;
  avg_days: number | null;
  spend_estimate: { low: number; high: number; currency: "USD" } | null;
  analyzed_at: string;
};

const CTAS = [
  "Order now", "Shop now", "Send message", "Send WhatsApp message", "Learn more", "Install now", "See details", "Sign up", "Book now",
  "Get offer", "Buy now", "Contact us", "Call now", "Watch more", "Download", "Apply now", "Get quote", "Subscribe", "Visit Instagram profile",
];
const CTA_SET = new Set(CTAS.map((c) => c.toLowerCase()));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SKIP = /^(Platforms|Menu|See ad details|See summary details|Sponsored|EU transparency|This ad has multiple versions|\d+ ads use this creative and text|0:00 \/ 0:00|​|)$/i;

function parseDate(s: string): string | null {
  // "Jul 23, 2026" বা "23 Jul 2026"
  let m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/);
  let mon: string | undefined, day: number | undefined, year: number | undefined;
  if (m) [mon, day, year] = [m[1], Number(m[2]), Number(m[3])];
  else {
    m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
    if (m) [day, mon, year] = [Number(m[1]), m[2], Number(m[3])];
  }
  if (!mon || !day || !year) return null;
  const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

export function parseAdLibrary(text: string, today: string): LibAnalysis {
  const clean = text.replace(/\r/g, "").replace(/​/g, "");
  const total = clean.match(/~?\s?([\d,]+)\s+results?/i);
  const starts = [...clean.matchAll(/(?:^|\n)\s*(Active|Inactive)\s*\n\s*Library ID:\s*(\d+)/g)];
  const ads: LibAd[] = [];
  starts.forEach((m, i) => {
    const block = clean.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index : clean.length);
    const lines = block.split("\n").map((l) => l.trim());
    const startedLine = lines.find((l) => /^Started running on/i.test(l)) ?? "";
    const started = parseDate(startedLine);
    const multi = block.match(/(\d+)\s+ads use this creative and text/i);
    const versions = multi ? Number(multi[1]) : /This ad has multiple versions/i.test(block) ? 2 : 1;
    // পেজের নাম: "See ad details/See summary details"-এর পরের লাইন, তারপর "Sponsored"
    const detailIdx = lines.findIndex((l) => /^See (ad|summary) details$/i.test(l));
    const page = detailIdx >= 0 ? (lines.slice(detailIdx + 1).find((l) => l && !SKIP.test(l)) ?? null) : null;
    const sponsoredIdx = lines.findIndex((l, k) => k > detailIdx && /^Sponsored$/i.test(l));
    const rest = sponsoredIdx >= 0 ? lines.slice(sponsoredIdx + 1) : [];
    const domainIdx = rest.findIndex((l) => /^[A-Z0-9.-]+\.[A-Z]{2,}$/.test(l));
    const endBody = rest.findIndex((l, k) => /^0:00 \/ 0:00$/.test(l) || k === domainIdx);
    const bodyLines = (endBody >= 0 ? rest.slice(0, endBody) : rest).filter((l) => !SKIP.test(l));
    const tail = (domainIdx >= 0 ? rest.slice(domainIdx + 1) : endBody >= 0 ? rest.slice(endBody + 1) : []).filter((l) => l && !SKIP.test(l) && !/^See more$|^System status/i.test(l));
    const ctaRaw = [...tail].reverse().find((l) => CTA_SET.has(l.toLowerCase()));
    // "Order Now" আর "Order now" একই বাটন
    const cta = ctaRaw ? (CTAS.find((c) => c.toLowerCase() === ctaRaw.toLowerCase()) ?? ctaRaw) : null;
    const headline = tail.find((l) => !CTA_SET.has(l.toLowerCase())) ?? null;
    const body = bodyLines.join("\n").trim().slice(0, 1500);
    ads.push({
      id: m[2],
      active: m[1] === "Active",
      started,
      days: started ? daysBetween(started, today) : null,
      page,
      body,
      domain: domainIdx >= 0 ? rest[domainIdx].toLowerCase() : null,
      headline: headline?.slice(0, 200) ?? null,
      cta,
      versions,
      video: /0:00 \/ 0:00/.test(block),
      links: [...new Set(body.match(/https?:\/\/[^\s)]+/g) ?? [])].slice(0, 3),
      rank: i,
      score: 0,
      label: "steady",
    });
  });

  // winner হওয়ার সম্ভাবনা: বেশি দিন চলছে, বেশি দেখানো (তালিকায় আগে), কয়েকটা ভার্সন
  const n = Math.max(1, ads.length);
  for (const a of ads) {
    const dayScore = a.days === null ? 0.3 : Math.min(1, a.days / 60);
    const rankScore = 1 - a.rank / n;
    const verScore = Math.min(1, (a.versions - 1) / 2);
    a.score = Math.round(100 * (0.5 * dayScore + 0.3 * rankScore + 0.2 * verScore));
    a.label = a.days !== null && a.days < 7 ? "testing" : a.score >= 60 ? "winner" : "steady";
  }

  const count = <T extends string>(list: (T | null)[]) => {
    const m = new Map<T, number>();
    for (const x of list) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const active = ads.filter((a) => a.active);
  const days = active.map((a) => a.days).filter((d): d is number => d !== null);

  // খরচের মোটা আন্দাজ: বাংলাদেশে একটা সাধারণ চালু বিজ্ঞাপন দিনে ~$২–৮; বেশি দেখানো আর কয়েক ভার্সনের বিজ্ঞাপন বেশি
  let low = 0;
  let high = 0;
  for (const a of active) {
    const weight = (a.rank < n * 0.1 ? 3 : a.rank < n * 0.3 ? 1.8 : 1) * (a.versions > 1 ? 1.4 : 1) * (a.days !== null && a.days < 3 ? 0.6 : 1);
    low += 2 * weight;
    high += 8 * weight;
  }
  // পেস্টে সব বিজ্ঞাপন না থাকলে (পাতা পুরো স্ক্রল না করলে) মোট ফলাফলের অনুপাতে বাড়ানো
  const totalResults = total ? Number(total[1].replace(/,/g, "")) : null;
  if (totalResults && active.length && totalResults > ads.length) {
    const factor = Math.min(10, totalResults / ads.length) * 0.6;
    low *= factor;
    high *= factor;
  }

  return {
    total_results: totalResults,
    ads,
    pages: count(ads.map((a) => a.page)).map(([name, c]) => ({ name, ads: c })),
    products: count(ads.flatMap((a) => (a.links.length ? a.links : [null])).map((l) => (l ? l.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null)))
      .slice(0, 15)
      .map(([link, c]) => ({ link, ads: c })),
    ctas: count(ads.map((a) => a.cta)).map(([cta, c]) => ({ cta, ads: c })),
    formats: { video: ads.filter((a) => a.video).length, image: ads.filter((a) => !a.video).length },
    new_last_7d: ads.filter((a) => a.days !== null && a.days <= 7).length,
    avg_days: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
    spend_estimate: active.length ? { low: Math.round(low), high: Math.round(high), currency: "USD" } : null,
    analyzed_at: new Date().toISOString(),
  };
}
