// প্রতিযোগীর ওয়েবসাইট দেখা: প্রোডাক্ট, দাম, ছাড়, অফারের লেখা। প্রথমে দোকানের নিজের পাবলিক তালিকা
// (Shopify-র products.json, WooCommerce-এর Store API), না পেলে পাতার ভেতরের প্রোডাক্ট তথ্য (JSON-LD)।
// কিছু সাইট (যেমন Cloudflare-এর পাহারায়) স্বয়ংক্রিয় দেখা আটকে দেয়; তখন "blocked" জানানো হয়।

export type SiteProduct = { key: string; name: string; url: string | null; price: number | null; regular: number | null; image: string | null };
export type SiteSnapshot = { platform: "shopify" | "woocommerce" | "other"; products: SiteProduct[]; offers: string[]; checked_at: string };
export type SiteResult = { status: "ok"; snapshot: SiteSnapshot } | { status: "blocked" | "error"; error: string };
export type SiteChange = { kind: "new_product" | "removed_product" | "price_down" | "price_up" | "sale_start" | "sale_end"; title: string; detail?: string };

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
};
const MAX_PRODUCTS = 300;

class Blocked extends Error {}

async function get(url: string, timeoutMs = 20_000) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await res.text();
  if (res.status === 403 || res.status === 429 || /Just a moment\.\.\.|cf-chl|challenge-platform/i.test(text.slice(0, 5000))) throw new Blocked("blocked");
  return { ok: res.ok, status: res.status, text, type: res.headers.get("content-type") ?? "" };
}

const decodeHtml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function shopify(origin: string): Promise<SiteProduct[] | null> {
  const out: SiteProduct[] = [];
  for (let page = 1; page <= 2; page++) {
    const r = await get(`${origin}/products.json?limit=250&page=${page}`);
    if (!r.ok || !r.type.includes("json")) return page === 1 ? null : out;
    const data = JSON.parse(r.text) as {
      products?: { id: number; title: string; handle: string; variants?: { price?: string; compare_at_price?: string | null }[]; images?: { src?: string }[] }[];
    };
    if (!data.products) return page === 1 ? null : out;
    for (const p of data.products) {
      const prices = (p.variants ?? []).map((v) => num(v.price)).filter((x): x is number => x !== null);
      const compares = (p.variants ?? []).map((v) => num(v.compare_at_price)).filter((x): x is number => x !== null);
      const price = prices.length ? Math.min(...prices) : null;
      const regular = compares.length ? Math.max(...compares) : null;
      out.push({ key: String(p.id), name: p.title, url: `${origin}/products/${p.handle}`, price, regular: regular && price && regular > price ? regular : null, image: p.images?.[0]?.src ?? null });
    }
    if (data.products.length < 250) break;
  }
  return out;
}

async function woocommerce(origin: string): Promise<SiteProduct[] | null> {
  const out: SiteProduct[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await get(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    if (!r.ok || !r.type.includes("json")) return page === 1 ? null : out;
    const data = JSON.parse(r.text) as {
      id: number;
      name: string;
      permalink?: string;
      prices?: { price?: string; regular_price?: string; currency_minor_unit?: number };
      images?: { src?: string }[];
    }[];
    if (!Array.isArray(data)) return page === 1 ? null : out;
    for (const p of data) {
      const div = 10 ** (p.prices?.currency_minor_unit ?? 0);
      const price = num(p.prices?.price);
      const regular = num(p.prices?.regular_price);
      out.push({
        key: String(p.id),
        name: decodeHtml(p.name),
        url: p.permalink ?? null,
        price: price !== null ? price / div : null,
        regular: regular !== null && price !== null && regular > price ? regular / div : null,
        image: p.images?.[0]?.src ?? null,
      });
    }
    if (data.length < 100) break;
  }
  return out;
}

// পাতার ভেতরের schema.org Product (অনেক সাইট SEO-র জন্য রাখে)
function jsonLdProducts(html: string, pageUrl: string): SiteProduct[] {
  const out: SiteProduct[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      const o = node as Record<string, unknown>;
      if (o["@graph"]) walk(o["@graph"]);
      const type = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
      if (type.includes("Product") && typeof o.name === "string") {
        const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
        const price = num(offers?.price ?? offers?.lowPrice);
        const url = typeof o.url === "string" ? o.url : pageUrl;
        const image = Array.isArray(o.image) ? String(o.image[0]) : typeof o.image === "string" ? o.image : null;
        out.push({ key: url, name: o.name, url, price, regular: null, image });
      }
      if (o.itemListElement) walk(o.itemListElement);
      if (o.item) walk(o.item);
    };
    walk(data);
  }
  return out;
}

// schema.org microdata বা Open Graph-এ লেখা প্রোডাক্ট (যেমন og:type=product আর itemprop="price")
function microdataProduct(html: string, pageUrl: string): SiteProduct | null {
  const meta = (re: RegExp) => html.match(re)?.[1] ?? null;
  const isProduct = /og:type['"]\s+content=['"]product/i.test(html) || /itemtype=["'][^"']*schema\.org\/Product["']/i.test(html);
  if (!isProduct) return null;
  const name = meta(/property=['"]og:title['"]\s+content=['"]([^'"]+)/i) ?? meta(/itemprop=["']name["'][^>]*content=["']([^"']+)/i);
  if (!name) return null;
  const price = num(meta(/itemprop=["']price["'][^>]*content=["']([^"']+)/i) ?? meta(/product:price:amount['"]\s+content=['"]([^'"]+)/i));
  // ক্যাটাগরি পাতাতেও কখনো Product লেখা থাকে; দাম না থাকলে প্রোডাক্ট ধরা হয় না
  if (price === null) return null;
  const image = meta(/property=['"]og:image['"]\s+content=['"]([^'"]+)/i);
  return { key: pageUrl, name: decodeHtml(name), url: pageUrl, price, regular: null, image };
}

async function generic(origin: string, homeHtml: string): Promise<SiteProduct[]> {
  const found = new Map<string, SiteProduct>();
  for (const p of jsonLdProducts(homeHtml, origin)) found.set(p.key, p);
  // সাইটম্যাপ থেকে প্রোডাক্ট পাতা (সর্বোচ্চ ২৫টা, একে একে)
  let urls: string[] = [];
  for (const sm of ["/product-sitemap.xml", "/sitemap_products_1.xml", "/sitemap.xml"]) {
    try {
      const r = await get(`${origin}${sm}`, 15_000);
      if (!r.ok) continue;
      const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1].trim());
      const productLocs = locs.filter((u) => /\/(product|products|p|item)\//i.test(u));
      if (productLocs.length) {
        urls = productLocs;
        break;
      }
      // পথ দেখে বোঝা না গেলে পুরো তালিকা থেকে সমান ফাঁকে নমুনা (শুরুতে সাধারণত ক্যাটাগরি থাকে)
      if (locs.length && sm === "/sitemap.xml") {
        const step = Math.max(1, Math.floor(locs.length / 30));
        urls = locs.filter((_, i) => i % step === 0);
      }
    } catch (err) {
      if (err instanceof Blocked) throw err;
    }
  }
  // হোমপেজে দেখানো লিংক আগে (সেখানে সাধারণত প্রোডাক্ট থাকে), তারপর সাইটম্যাপের নমুনা
  const homeLinks = [...homeHtml.matchAll(/href=["']([^"'#?]+)["']/gi)]
    .map((m) => {
      try {
        return new URL(m[1], origin).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u && u.startsWith(origin) && u.replace(origin, "").split("/").filter(Boolean).length >= 1)
    .filter((u) => !/\.(css|js|png|jpe?g|webp|svg|ico|xml)$|\/(cart|checkout|login|register|account|wishlist|compare|contact|about|blog|policy|terms)/i.test(u));
  const sitemapSet = new Set(urls);
  const featured = [...new Set(homeLinks)].filter((u) => sitemapSet.size === 0 || sitemapSet.has(u) || sitemapSet.has(u.replace(/\/$/, "")) || sitemapSet.has(`${u}/`));
  const queue = [...new Set([...featured.slice(0, 30), ...urls])].slice(0, 45);
  for (const u of queue) {
    try {
      const r = await get(u, 12_000);
      const ld = jsonLdProducts(r.text, u);
      for (const p of ld) found.set(p.key, p);
      if (!ld.length) {
        const md = microdataProduct(r.text, u);
        if (md) found.set(md.key, md);
      }
    } catch (err) {
      if (err instanceof Blocked) break;
    }
  }
  return [...found.values()];
}

// হোমপেজের লেখা থেকে অফারের লাইন (ছাড়, ফ্রি ডেলিভারি, কম্বো ইত্যাদি)
function offerLines(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const lines = text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 6 && l.length <= 160);
  const hit = lines.filter((l) => /(\d+\s?%|% off|off\b|discount|sale|free (home )?delivery|combo|offer|buy \d|ছাড়|ডিসকাউন্ট|অফার|ফ্রি|কম্বো|ক্যাশ অন)/i.test(l));
  return [...new Set(hit)].slice(0, 15);
}

export async function checkSite(rawUrl: string): Promise<SiteResult> {
  let origin: string;
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    origin = u.origin;
  } catch {
    return { status: "error", error: "Invalid website address." };
  }
  try {
    const home = await get(origin);
    if (!home.ok) return { status: "error", error: `The website answered ${home.status}.` };
    const offers = offerLines(home.text);
    let platform: SiteSnapshot["platform"] = "other";
    let products: SiteProduct[] | null = null;
    if (/cdn\.shopify\.com|Shopify\.theme/i.test(home.text)) {
      products = await shopify(origin);
      if (products) platform = "shopify";
    }
    if (!products && /wp-content|woocommerce/i.test(home.text)) {
      products = await woocommerce(origin);
      if (products) platform = "woocommerce";
    }
    if (!products) products = await generic(origin, home.text);
    return {
      status: "ok",
      snapshot: { platform, products: products.slice(0, MAX_PRODUCTS), offers, checked_at: new Date().toISOString() },
    };
  } catch (err) {
    if (err instanceof Blocked) return { status: "blocked", error: "This website blocks automatic checks." };
    return { status: "error", error: err instanceof Error ? err.message.slice(0, 200) : "error" };
  }
}

const money = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"));

// আগের ছবির সাথে তুলনা: নতুন/সরানো প্রোডাক্ট, দাম কমা-বাড়া, ছাড় শুরু-শেষ। অনেক হলে একটা লাইনে।
export function diffSnapshots(prev: SiteSnapshot | null, next: SiteSnapshot): SiteChange[] {
  if (!prev || prev.products.length === 0) return [];
  const before = new Map(prev.products.map((p) => [p.key, p]));
  const after = new Map(next.products.map((p) => [p.key, p]));
  const added = next.products.filter((p) => !before.has(p.key));
  // তালিকা হঠাৎ অনেক ছোট হলে (সাইট আধা লোড), সরানোর খবর দেওয়া হয় না
  const removed = next.products.length >= prev.products.length * 0.7 ? prev.products.filter((p) => !after.has(p.key)) : [];
  const down: string[] = [];
  const up: string[] = [];
  const saleStart: string[] = [];
  const saleEnd: string[] = [];
  for (const p of next.products) {
    const o = before.get(p.key);
    if (!o || p.price === null || o.price === null) continue;
    if (p.price < o.price * 0.99) down.push(`${p.name}: ${money(o.price)} → ${money(p.price)}`);
    else if (p.price > o.price * 1.01) up.push(`${p.name}: ${money(o.price)} → ${money(p.price)}`);
    if (p.regular && !o.regular) saleStart.push(`${p.name}: ${money(p.regular)} → ${money(p.price)}`);
    if (!p.regular && o.regular) saleEnd.push(p.name);
  }
  const group = (kind: SiteChange["kind"], list: string[], one: string, many: (n: number) => string): SiteChange[] =>
    list.length === 0 ? [] : [{ kind, title: list.length === 1 ? `${one}: ${list[0]}`.slice(0, 300) : many(list.length), detail: list.slice(0, 12).join(" · ").slice(0, 1000) }];
  return [
    ...group("new_product", added.map((p) => `${p.name} (${money(p.price)})`), "New product", (n) => `${n} new products`),
    ...group("removed_product", removed.map((p) => p.name), "Product removed", (n) => `${n} products removed`),
    ...group("price_down", down, "Price cut", (n) => `${n} prices cut`),
    ...group("price_up", up, "Price raised", (n) => `${n} prices raised`),
    ...group("sale_start", saleStart, "Discount started", (n) => `Discount started on ${n} products`),
    ...group("sale_end", saleEnd, "Discount ended", (n) => `Discount ended on ${n} products`),
  ];
}
