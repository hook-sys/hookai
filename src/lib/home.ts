import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGetAll, graphRequest, type MetaAction } from "@/lib/meta/graph";
import { cached } from "@/lib/insights/live";
import { addDays, todayIn } from "@/lib/dates";
import { pickPurchases } from "@/lib/metrics";

// সব ক্লায়েন্টের হোম: প্রতিটা ক্লায়েন্টের খরচ, অর্ডার, লক্ষ্য আর ঝামেলা এক জায়গায়।
// Meta-র হিসাব প্রতিটা Ad Account-এ ১৫ মিনিট জমা থাকে, তাই পাতা দ্রুত খোলে।

export type Tone = "red" | "yellow" | "green" | "gray";

export type AccountSnap = {
  id: string;
  name: string;
  status: number;
  currency: string | null;
  daily: { date: string; spend: number; purchases: number }[]; // গত ৮ দিন, আজসহ
  rejected: { id: string; name: string; status: string }[];
  error?: string;
};

export type Task = {
  key: string;
  tone: "red" | "yellow";
  clientId: string;
  clientName: string;
  accountId?: string;
  title: [string, string];
  detail?: string;
  href: string;
  notificationId?: string;
};

export type ClientRow = {
  id: string;
  name: string;
  target: number | null;
  currency: string | null;
  tone: Tone;
  reasons: [string, string][];
  spendToday: number;
  spendYesterday: number;
  spend7: number;
  spark: number[]; // গত ৭ দিন + আজ
  ordersToday: number;
  orders7: number;
  costPerOrder: number | null;
  deliveryRate: number | null; // গত ৩০ দিনের শেষ হওয়া অর্ডারে
  accounts: AccountSnap[];
};

const PROBLEM_STATUS: Record<number, [string, string]> = {
  2: ["disabled", "বন্ধ (Disabled)"],
  3: ["unpaid", "বিল বাকি (Unsettled)"],
  7: ["under risk review", "রিভিউতে আটকে"],
  8: ["pending settlement", "পেমেন্ট বাকি"],
  9: ["in grace period", "গ্রেস পিরিয়ডে"],
  100: ["closing", "বন্ধ হচ্ছে"],
  101: ["closed", "বন্ধ (Closed)"],
};

async function accountSnap(supabase: SupabaseClient, userId: string, token: string, id: string, name: string): Promise<AccountSnap> {
  try {
    const info = await graphRequest<{ name: string; account_status?: number; currency?: string; timezone_name?: string }>(`/${id}`, {
      params: { fields: "name,account_status,currency,timezone_name" },
      token,
    });
    const today = todayIn(info.timezone_name);
    const since = addDays(today, -7);
    const ctx = { supabase, userId, token, accountId: id };
    const data = await cached(ctx, "home", since, today, today, async () => {
      const [rows, rejected] = await Promise.all([
        graphGetAll<{ date_start: string; spend?: string; actions?: MetaAction[] }>(
          `/${id}/insights`,
          { level: "account", time_range: JSON.stringify({ since, until: today }), time_increment: "1", fields: "spend,actions", limit: "31" },
          token,
          1,
        ),
        graphGetAll<{ id: string; name: string; effective_status: string }>(
          `/${id}/ads`,
          { fields: "id,name,effective_status", effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]), limit: "25" },
          token,
          1,
        ).catch(() => []),
      ]);
      const byDay = new Map(rows.map((r) => [r.date_start, r]));
      const daily = Array.from({ length: 8 }, (_, i) => {
        const date = addDays(since, i);
        const r = byDay.get(date);
        return { date, spend: Number(r?.spend) || 0, purchases: pickPurchases(r?.actions) };
      });
      return { daily, rejected: rejected.map((a) => ({ id: a.id, name: a.name, status: a.effective_status })) };
    });
    return { id, name: info.name || name, status: info.account_status ?? 1, currency: info.currency ?? null, ...data };
  } catch (err) {
    return { id, name, status: 1, currency: null, daily: [], rejected: [], error: err instanceof Error ? err.message.slice(0, 160) : "error" };
  }
}

// একসাথে বেশি অনুরোধ না পাঠিয়ে ৬টা করে
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function loadHome(supabase: SupabaseClient, userId: string, token: string | null) {
  // অর্ডারের তারিখ দোকানের (ঢাকার) সময়ে
  const today = todayIn("Asia/Dhaka");
  const since30 = addDays(today, -30);
  const since7 = addDays(today, -6);

  const [{ data: clients }, { data: links }, { data: notes }, { data: launches }, { data: proposals }] = await Promise.all([
    supabase.from("clients").select("id, name, target_cost_per_order, capi_enabled, capi_last_error").eq("user_id", userId).order("created_at"),
    supabase.from("client_ad_accounts").select("client_id, ad_account_id, ad_account_name").eq("user_id", userId),
    supabase
      .from("notifications")
      .select("id, ad_account_id, kind, severity, title, body, created_at")
      .eq("user_id", userId)
      .is("read_at", null)
      .gte("created_at", addDays(today, -7))
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("ad_launches").select("id, client_id, ad_account_id, status, spec, updated_at").eq("user_id", userId).in("status", ["failed", "waiting_video", "paused", "draft"]),
    supabase.from("assistant_messages").select("id, client_id, proposal").eq("user_id", userId).eq("proposal_status", "pending"),
  ]);

  // অর্ডার: গত ৩০ দিন (ডেলিভারি রেটের জন্য), ক্লায়েন্ট অনুযায়ী
  const orders: { client_id: string | null; order_date: string; status: string }[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data } = await supabase.from("orders").select("client_id, order_date, status").eq("user_id", userId).gte("order_date", since30).range(from, from + 999);
    orders.push(...((data ?? []) as typeof orders));
    if (!data || data.length < 1000) break;
  }

  const allLinks = links ?? [];
  const snaps = token
    ? await pool(allLinks, 6, (l) => accountSnap(supabase, userId, token, l.ad_account_id, l.ad_account_name ?? l.ad_account_id))
    : [];
  const snapOf = new Map(snaps.map((s) => [s.id, s]));
  const clientOfAccount = new Map(allLinks.map((l) => [l.ad_account_id, l.client_id]));

  const tasks: Task[] = [];
  const rows: ClientRow[] = (clients ?? []).map((c) => {
    const accounts = allLinks.filter((l) => l.client_id === c.id).map((l) => snapOf.get(l.ad_account_id)).filter((x): x is AccountSnap => !!x);
    const sumDay = (offset: number) => accounts.reduce((s, a) => s + (a.daily[a.daily.length - 1 - offset]?.spend ?? 0), 0);
    const spark = Array.from({ length: 8 }, (_, i) => accounts.reduce((s, a) => s + (a.daily[i]?.spend ?? 0), 0));
    const spend7 = spark.slice(1).reduce((s, x) => s + x, 0);
    const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))];

    const mine = orders.filter((o) => o.client_id === c.id);
    const real = (o: { status: string }) => o.status !== "cancelled";
    const ordersToday = mine.filter((o) => o.order_date === today && real(o)).length;
    const orders7 = mine.filter((o) => o.order_date >= since7 && real(o)).length;
    const orders3 = mine.filter((o) => o.order_date >= addDays(today, -2)).length;
    const finished = mine.filter((o) => ["delivered", "returned", "cancelled"].includes(o.status));
    // কুরিয়ারের খবর না এলে (যেমন Shopify-তে ডেলিভারি ট্র্যাক হয় না) হার মিথ্যা ০% দেখায়, তাই তখন হিসাব হয় না
    const tracked = finished.filter((o) => o.status !== "cancelled").length >= 5;
    const deliveryRate = tracked && finished.length >= 10 ? Math.round((finished.filter((o) => o.status === "delivered").length / finished.length) * 100) : null;
    const costPerOrder = orders7 > 0 && spend7 > 0 ? spend7 / orders7 : null;
    const target = c.target_cost_per_order === null ? null : Number(c.target_cost_per_order);

    const reasons: [string, string][] = [];
    let tone: Tone = "green";
    const bump = (t: "red" | "yellow") => (tone = tone === "red" || t === "red" ? "red" : "yellow");
    const add = (t: "red" | "yellow", en: string, bn: string, task?: Omit<Task, "key" | "tone" | "clientId" | "clientName" | "title">) => {
      bump(t);
      reasons.push([en, bn]);
      if (task) tasks.push({ key: `${c.id}-${tasks.length}`, tone: t, clientId: c.id, clientName: c.name, title: [en, bn], ...task });
    };

    for (const a of accounts) {
      const st = PROBLEM_STATUS[a.status];
      const spent = a.daily.some((d) => d.spend > 0);
      if (st) add(spent ? "red" : "yellow", `${a.name}: account ${st[0]}`, `${a.name}: অ্যাকাউন্ট ${st[1]}`, { accountId: a.id, href: "/assets" });
      // বন্ধ অ্যাকাউন্টের সব বিজ্ঞাপনই সমস্যায় দেখায়; আসল সমস্যা অ্যাকাউন্টটাই
      if (a.rejected.length && !st)
        add("yellow", `${a.name}: ${a.rejected.length} ad(s) rejected or with issues`, `${a.name}: ${a.rejected.length}টা বিজ্ঞাপন বাতিল বা সমস্যায়`, {
          accountId: a.id,
          href: "/manage",
          detail: a.rejected.slice(0, 3).map((r) => r.name).join(", "),
        });
      if (a.error) add("yellow", `${a.name}: couldn't read from Meta`, `${a.name}: Meta থেকে পড়া যায়নি`, { accountId: a.id, href: "/settings", detail: a.error });
    }
    if (target && costPerOrder) {
      if (costPerOrder > target * 1.25)
        add("red", `Cost per order ${costPerOrder.toFixed(2)} is well above target ${target}`, `অর্ডারপ্রতি খরচ ${costPerOrder.toFixed(2)}, লক্ষ্য ${target}-এর অনেক বেশি`, { href: "/orders" });
      else if (costPerOrder > target) add("yellow", `Cost per order above target`, `অর্ডারপ্রতি খরচ লক্ষ্যের বেশি`);
    }
    if (deliveryRate !== null && deliveryRate < 50)
      add("red", `Delivery rate only ${deliveryRate}%`, `ডেলিভারি রেট মাত্র ${deliveryRate}%`, { href: "/orders" });
    else if (deliveryRate !== null && deliveryRate < 65) add("yellow", `Delivery rate ${deliveryRate}%`, `ডেলিভারি রেট ${deliveryRate}%`);
    if (spend7 > 0 && orders3 === 0 && mine.length > 0)
      add("yellow", "Spending but no orders in 3 days", "খরচ হচ্ছে কিন্তু ৩ দিনে কোনো অর্ডার নেই", { href: "/orders", detail: "Check the store connection." });
    if (c.capi_enabled && c.capi_last_error) add("yellow", "Conversions API error", "Conversions API-তে সমস্যা", { href: "/assets", detail: c.capi_last_error.slice(0, 120) });
    if (accounts.length === 0) {
      tone = "gray";
      reasons.push(["No ad account linked", "কোনো Ad Account যুক্ত নেই"]);
    } else if (!target && tone === "green") reasons.push(["Set a target cost per order", "অর্ডারপ্রতি খরচের লক্ষ্য দাও"]);

    return {
      id: c.id,
      name: c.name,
      target,
      currency: currencies.length === 1 ? currencies[0] : null,
      tone,
      reasons,
      spendToday: sumDay(0),
      spendYesterday: sumDay(1),
      spend7,
      spark,
      ordersToday,
      orders7,
      costPerOrder,
      deliveryRate,
      accounts,
    };
  });

  // অন্য জায়গার ঝামেলা: সতর্কবার্তা, আটকে থাকা বিজ্ঞাপন, AI-এর প্রস্তাব
  const nameOf = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const seen = new Set<string>();
  for (const n of notes ?? []) {
    const clientId = clientOfAccount.get(n.ad_account_id);
    if (!clientId) continue;
    // একই অ্যাকাউন্টের একই সতর্কবার্তা কয়েকবার এলে একবারই দেখানো
    if (seen.has(n.ad_account_id + n.title)) continue;
    seen.add(n.ad_account_id + n.title);
    // অ্যাকাউন্ট বন্ধের খবর উপরে Meta থেকে সরাসরি আসে, তাই একই কথা দুবার না
    if (n.kind === "account_status") continue;
    tasks.push({
      key: `n-${n.id}`,
      tone: n.severity === "critical" ? "red" : "yellow",
      clientId,
      clientName: nameOf.get(clientId) ?? "",
      accountId: n.ad_account_id,
      title: [n.title, n.title],
      detail: n.body?.slice(0, 160),
      href: n.kind === "pixel_stale" ? "/assets" : "/rules",
      notificationId: n.id,
    });
  }
  for (const l of launches ?? []) {
    const clientId = l.client_id ?? clientOfAccount.get(l.ad_account_id);
    if (!clientId) continue;
    const name = (l.spec as { name?: string })?.name ?? "";
    const t: Record<string, ["red" | "yellow", string, string]> = {
      failed: ["red", `New ad failed: ${name}`, `নতুন বিজ্ঞাপন হয়নি: ${name}`],
      waiting_video: ["yellow", `Finish the video ad: ${name}`, `ভিডিও বিজ্ঞাপন শেষ করো: ${name}`],
      paused: ["yellow", `Created but not turned on: ${name}`, `তৈরি হয়েছে, চালু হয়নি: ${name}`],
      draft: ["yellow", `Draft waiting for review: ${name}`, `খসড়া দেখার অপেক্ষায়: ${name}`],
    };
    const [tone, en, bn] = t[l.status];
    tasks.push({ key: `l-${l.id}`, tone, clientId, clientName: nameOf.get(clientId) ?? "", accountId: l.ad_account_id, title: [en, bn], href: `/launch/${l.id}` });
  }
  for (const p of proposals ?? []) {
    if (!p.client_id) continue;
    const summary = (p.proposal as { summary?: string })?.summary ?? "";
    tasks.push({
      key: `p-${p.id}`,
      tone: "yellow",
      clientId: p.client_id,
      clientName: nameOf.get(p.client_id) ?? "",
      title: ["AI assistant is waiting for your approval", "AI সহকারী অনুমোদনের অপেক্ষায়"],
      detail: summary,
      href: "/assistant",
    });
  }
  tasks.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1));

  const order: Record<Tone, number> = { red: 0, yellow: 1, green: 2, gray: 3 };
  rows.sort((a, b) => order[a.tone] - order[b.tone] || b.spend7 - a.spend7);
  return { rows, tasks };
}
