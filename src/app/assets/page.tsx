import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Building2, CheckCircle2, Globe, Radio, Send, ShieldCheck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient, currentClient } from "@/lib/clients";
import { accountHealth, accountPixels, checkSitePixels, pagesWithInstagram, purchaseValueCheck } from "@/lib/meta/assets";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, PageHeader, cn } from "@/components/ui";
import { AddPixelPanel, CapiForm, WebsiteForm } from "./AssetsClient";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Pixel & assets", "Pixel ও অ্যাসেট") };
}

type Issue = { level: "critical" | "warning" | "info"; text: string };

export default async function AssetsPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: conn } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const scope = await accountInCurrentClient(supabase, user.id, conn?.selected_ad_account_id ?? null);
  if (!conn?.selected_ad_account_id || !scope.ok) {
    return (
      <AppShell active="assets">
        <PageHeader title={tr("Pixel & assets", "Pixel ও অ্যাসেট")} />
        <EmptyState icon={Building2} title={tr("Pick an ad account", "একটা Ad Account বাছো")} text={tr("Choose the client's ad account from the menu at the top.", "উপরের মেনু থেকে ক্লায়েন্টের Ad Account বাছো।")} />
      </AppShell>
    );
  }
  const accountId = conn.selected_ad_account_id;
  const token = decrypt(conn.access_token_encrypted);
  const { client } = await currentClient(supabase, user.id);
  const { data: cs } = client
    ? await supabase
        .from("clients")
        .select("website_url, capi_pixel_id, capi_enabled, capi_send_confirmed, capi_send_delivered, capi_last_sent_at, capi_last_error")
        .eq("id", client.id)
        .maybeSingle()
    : { data: null };

  const [account, pixels, pv, pages, site, capiStats] = await Promise.all([
    accountHealth(token, accountId).catch(() => null),
    accountPixels(token, accountId).catch(() => []),
    purchaseValueCheck(token, accountId).catch(() => null),
    pagesWithInstagram(token, accountId).catch(() => []),
    cs?.website_url ? checkSitePixels(cs.website_url) : Promise.resolve(null),
    client
      ? supabase
          .from("orders")
          .select("customer_hash, capi_confirmed_at, capi_delivered_at, created_at")
          .eq("user_id", user.id)
          .eq("client_id", client.id)
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .limit(1000)
          .then(({ data }) => ({
            total: data?.length ?? 0,
            withCustomer: (data ?? []).filter((o) => o.customer_hash).length,
            sent: (data ?? []).filter((o) => o.capi_confirmed_at || o.capi_delivered_at).length,
          }))
      : Promise.resolve(null),
  ]);

  // ---------- সমস্যার তালিকা ----------
  const issues: Issue[] = [];
  const accountPixelIds = new Set(pixels.map((p) => p.id));
  const sitePixels = site ? [...new Set([...site.pixelIds, ...site.viaGtm])] : [];
  const DAY = 86400_000;
  if (account && account.status !== 1) issues.push({ level: "critical", text: tr(`Ad account status is ${account.status} (not active). Check Account Quality / Billing.`, `Ad Account চালু নেই (অবস্থা ${account.status})। Account Quality / Billing দেখো।`) });
  if (account && !account.hasFunding) issues.push({ level: "warning", text: tr("No payment method on this ad account.", "এই Ad Account-এ কোনো পেমেন্ট পদ্ধতি নেই।") });
  if (account?.spendCap && account.amountSpent !== null && account.amountSpent >= account.spendCap * 0.9) {
    issues.push({ level: "warning", text: tr("Account spending limit is almost reached; ads will stop.", "অ্যাকাউন্টের খরচের সীমা প্রায় শেষ; বিজ্ঞাপন থেমে যাবে।") });
  }
  for (const p of pixels) {
    const stale = !p.lastFired || Date.now() - new Date(p.lastFired).getTime() > DAY;
    if (p.usedByActiveAdSets > 0 && stale) {
      issues.push({ level: "critical", text: tr(`Active ads optimise for "${p.name}", but it hasn't received events in 24 hours.`, `চালু বিজ্ঞাপন "${p.name}" Pixel-এ চলছে, কিন্তু ২৪ ঘণ্টায় কোনো event আসেনি।`) });
    }
  }
  if (pixels.length === 0) issues.push({ level: "critical", text: tr("No pixel on this ad account. Add one below.", "এই Ad Account-এ কোনো Pixel নেই। নিচ থেকে যোগ করো।") });
  if (site?.ok && sitePixels.length === 0 && site.shopify) {
    issues.push({
      level: "info",
      text: tr(
        "Shopify site: a pixel added through Shopify's Facebook & Instagram channel isn't visible in the page code, so check it in Events Manager instead.",
        "Shopify সাইট: Shopify-র Facebook & Instagram চ্যানেল দিয়ে বসানো Pixel পাতার কোডে দেখা যায় না, তাই Events Manager-এ দেখো।",
      ),
    });
  } else if (site?.ok && sitePixels.length === 0) {
    issues.push({ level: "warning", text: tr("No Meta pixel found on the website's home page (it may load later; check with Meta Pixel Helper).", "ওয়েবসাইটের হোম পেজে কোনো Meta Pixel পাওয়া যায়নি (পরে লোড হতে পারে; Meta Pixel Helper দিয়ে দেখো)।") });
  }
  if (site?.ok && sitePixels.length > 0) {
    const missing = sitePixels.filter((id) => !accountPixelIds.has(id));
    if (missing.length === sitePixels.length) {
      issues.push({ level: "critical", text: tr(`The website's pixel (${missing.join(", ")}) is not on this ad account, so ads can't use its data. Add it below.`, `ওয়েবসাইটের Pixel (${missing.join(", ")}) এই Ad Account-এ নেই, তাই বিজ্ঞাপন এর ডাটা পায় না। নিচ থেকে যোগ করো।`) });
    }
    for (const p of pixels.filter((x) => x.usedByActiveAdSets > 0 && !sitePixels.includes(x.id))) {
      issues.push({ level: "warning", text: tr(`Active ads use "${p.name}", which wasn't found on the website.`, `চালু বিজ্ঞাপন "${p.name}" ব্যবহার করছে, কিন্তু ওয়েবসাইটে এটা পাওয়া যায়নি।`) });
    }
  }
  if (pv && pv.avgValue !== null && pv.avgValue > 100_000) {
    // গড় মূল্য অসম্ভব বড়: সাইট মূল্যের জায়গায় অন্য সংখ্যা (যেমন অর্ডার ID) পাঠাচ্ছে
    issues.push({
      level: "critical",
      text: tr(
        `Purchase values are broken: ${pv.purchases} purchases worth ${Math.round(pv.value).toLocaleString("en-US")} in total. The site sends a wrong number as the value, so ROAS and value-based optimisation are meaningless. Fix the pixel's Purchase "value" on the website.`,
        `Purchase-এর মূল্য ভুল: ${pv.purchases}টি Purchase-এর মোট মূল্য ${Math.round(pv.value).toLocaleString("en-US")}। সাইট মূল্যের জায়গায় ভুল সংখ্যা পাঠাচ্ছে, তাই ROAS আর মূল্যভিত্তিক optimize অর্থহীন। ওয়েবসাইটে Pixel-এর Purchase "value" ঠিক করতে হবে।`,
      ),
    });
  } else if (pv && account?.currency && account.currency !== "BDT" && pv.avgValue !== null && pv.avgValue > 150) {
    issues.push({
      level: "warning",
      text: tr(
        `Average purchase value is ${Math.round(pv.avgValue)} ${account.currency}: the site probably sends prices in Taka to a ${account.currency} account, so ROAS (${pv.roas?.toFixed(0)}×) is wrong.`,
        `গড় Purchase মূল্য ${Math.round(pv.avgValue)} ${account.currency}: সাইট সম্ভবত টাকায় দাম পাঠাচ্ছে কিন্তু অ্যাকাউন্ট ${account.currency}-এ, তাই ROAS (${pv.roas?.toFixed(0)}×) ভুল দেখায়।`,
      ),
    });
  }
  for (const p of pages.filter((x) => !x.instagram)) {
    issues.push({ level: "info", text: tr(`Page "${p.name}" has no Instagram linked; Instagram ads show the page name.`, `"${p.name}" পেজে Instagram যুক্ত নেই; Instagram-এ বিজ্ঞাপন পেজের নামে দেখাবে।`) });
  }
  if (cs?.capi_enabled && cs.capi_last_error) issues.push({ level: "warning", text: tr(`Conversions API: ${cs.capi_last_error}`, `Conversions API: ${cs.capi_last_error}`) });

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }) : "—");
  const tone = { critical: "text-red-700 dark:text-red-400", warning: "text-amber-700 dark:text-amber-400", info: "text-zinc-600 dark:text-zinc-400" };

  return (
    <AppShell active="assets">
      <PageHeader
        title={tr("Pixel & assets", "Pixel ও অ্যাসেট")}
        description={tr(`${account?.name ?? accountId} · everything ads need to track sales correctly`, `${account?.name ?? accountId} · বিক্রি ঠিকমতো গোনার জন্য যা যা দরকার`)}
      />

      <Card className="mb-6">
        <CardHeader icon={issues.some((i) => i.level === "critical") ? AlertTriangle : ShieldCheck} title={issues.length ? tr(`${issues.length} things to check`, `${issues.length}টি জিনিস দেখার আছে`) : tr("All good", "সব ঠিক আছে")} />
        <ul className="flex flex-col gap-2 p-5 text-sm">
          {issues.map((i, n) => (
            <li key={n} className={cn("flex items-start gap-2", tone[i.level])}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {i.text}
            </li>
          ))}
          {issues.length === 0 && (
            <li className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {tr("No problems found.", "কোনো সমস্যা পাওয়া যায়নি।")}
            </li>
          )}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Radio} title={tr("Pixels on this ad account", "এই Ad Account-এর Pixel")} description={tr("Events in the last 7 days.", "গত ৭ দিনের event।")} />
          <ul className="divide-y divide-zinc-900/[0.06] text-sm dark:divide-white/[0.07]">
            {pixels.map((p) => {
              const fresh = p.lastFired && Date.now() - new Date(p.lastFired).getTime() < DAY;
              const onSite = sitePixels.includes(p.id);
              return (
                <li key={p.id} className="flex flex-col gap-1 px-5 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge tone={fresh ? "success" : "danger"}>{fresh ? tr("Receiving", "event আসছে") : tr("No events 24h", "২৪ ঘণ্টা event নেই")}</Badge>
                    {site?.ok && <Badge tone={onSite ? "success" : "neutral"}>{onSite ? tr("On website", "সাইটে আছে") : tr("Not on website", "সাইটে নেই")}</Badge>}
                    {p.usedByActiveAdSets > 0 && <Badge tone="brand">{tr(`${p.usedByActiveAdSets} active ad sets`, `${p.usedByActiveAdSets}টি চালু Ad Set`)}</Badge>}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {p.id}
                    {p.owner ? ` · ${p.owner}` : ""} · {tr("last", "শেষ")} {when(p.lastFired)}
                  </span>
                  {Object.keys(p.events).length > 0 && (
                    <span className="text-xs text-zinc-500">
                      {Object.entries(p.events)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`)
                        .join(" · ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-zinc-900/[0.06] p-5 dark:border-white/[0.07]">
            <AddPixelPanel existing={[...accountPixelIds]} />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Globe} title={tr("Website check", "ওয়েবসাইট যাচাই")} description={tr("Which pixel is installed on the site (directly or via Google Tag Manager).", "সাইটে কোন Pixel বসানো (সরাসরি বা Google Tag Manager দিয়ে)।")} />
            <div className="flex flex-col gap-3 p-5 text-sm">
              <WebsiteForm url={cs?.website_url ?? ""} disabled={!client} />
              {site && !site.ok && <p className="text-red-600">{tr(`Couldn't open the site: ${site.error}`, `সাইট খোলা যায়নি: ${site.error}`)}</p>}
              {site?.ok && (
                <p className="text-zinc-600 dark:text-zinc-400">
                  {sitePixels.length
                    ? tr(`Found: ${sitePixels.join(", ")}${site.viaGtm.length ? " (via Tag Manager)" : ""}`, `পাওয়া গেছে: ${sitePixels.join(", ")}${site.viaGtm.length ? " (Tag Manager দিয়ে)" : ""}`)
                    : tr("No pixel found on the home page.", "হোম পেজে কোনো Pixel পাওয়া যায়নি।")}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={Wallet} title={tr("Ad account", "Ad Account")} />
            {account && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-5 text-sm">
                <dt className="text-zinc-500">{tr("Status", "অবস্থা")}</dt>
                <dd>{account.status === 1 ? <Badge tone="success">{tr("Active", "চালু")}</Badge> : <Badge tone="danger">{account.status}</Badge>}</dd>
                <dt className="text-zinc-500">{tr("Currency / time zone", "মুদ্রা / সময়")}</dt>
                <dd>{account.currency} · {account.timezone}</dd>
                <dt className="text-zinc-500">{tr("Business", "BM")}</dt>
                <dd>{account.business ?? "—"}</dd>
                <dt className="text-zinc-500">{tr("Payment", "পেমেন্ট")}</dt>
                <dd>{account.fundingLabel ?? tr("none", "নেই")}</dd>
                {account.spendCap && (
                  <>
                    <dt className="text-zinc-500">{tr("Spending limit", "খরচের সীমা")}</dt>
                    <dd>{account.amountSpent?.toFixed(0)} / {account.spendCap.toFixed(0)} {account.currency}</dd>
                  </>
                )}
                {pv && (
                  <>
                    <dt className="text-zinc-500">{tr("Purchases (30 days)", "Purchase (৩০ দিন)")}</dt>
                    <dd>{pv.purchases.toLocaleString("en-US")}{pv.roas !== null ? ` · ROAS ${pv.roas.toFixed(1)}×` : ""}</dd>
                  </>
                )}
              </dl>
            )}
            <ul className="border-t border-zinc-900/[0.06] px-5 py-3 text-sm dark:border-white/[0.07]">
              {pages.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                  <span>{p.name}</span>
                  <Badge tone={p.instagram ? "success" : "neutral"}>{p.instagram ? `Instagram ${p.instagram === "linked" ? "" : "@" + p.instagram}` : tr("No Instagram", "Instagram নেই")}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          icon={Send}
          title={tr("Conversions API: send real orders to Meta", "Conversions API: আসল অর্ডার Meta-কে জানাও")}
          description={tr(
            "Confirmed and delivered orders go to the pixel as OrderConfirmed / OrderDelivered events, so Meta can learn who actually buys (not just who clicks Order).",
            "কনফার্ম আর ডেলিভারি হওয়া অর্ডার Pixel-এ OrderConfirmed / OrderDelivered হিসেবে যায়, যাতে Meta শেখে কারা সত্যি কেনে (শুধু অর্ডার বাটন চাপা নয়)।",
          )}
        />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <CapiForm
            disabled={!client}
            pixels={pixels.map((p) => ({ id: p.id, name: p.name }))}
            pixelId={cs?.capi_pixel_id ?? ""}
            enabled={cs?.capi_enabled ?? false}
            sendConfirmed={cs?.capi_send_confirmed ?? true}
            sendDelivered={cs?.capi_send_delivered ?? true}
          />
          <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {capiStats && (
              <p>
                {tr(
                  `Last 7 days: ${capiStats.total} orders, ${capiStats.withCustomer} with customer details, ${capiStats.sent} sent to Meta.`,
                  `গত ৭ দিন: ${capiStats.total}টি অর্ডার, ${capiStats.withCustomer}টিতে ক্রেতার তথ্য আছে, ${capiStats.sent}টি Meta-তে গেছে।`,
                )}
              </p>
            )}
            <p>{tr("Last sent:", "শেষ পাঠানো:")} {when(cs?.capi_last_sent_at ?? null)}</p>
            <p className="text-xs">
              {tr(
                "Only hashed phone, email and city are sent (never the real values). Older orders (before this update) have no customer details and are skipped. To optimise for real buyers, make a Custom Conversion on OrderConfirmed or OrderDelivered in Events Manager.",
                "শুধু hash করা ফোন, ইমেইল আর শহর যায় (আসল তথ্য কখনো নয়)। এই আপডেটের আগের অর্ডারে ক্রেতার তথ্য নেই, তাই সেগুলো বাদ যায়। আসল ক্রেতার জন্য optimize করতে Events Manager-এ OrderConfirmed বা OrderDelivered দিয়ে Custom Conversion বানাও।",
              )}
            </p>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
