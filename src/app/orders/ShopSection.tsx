import Link from "next/link";
import { RefreshCw, Store } from "lucide-react";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";
import type { ShopConnection } from "@/lib/shops";
import { shopifyConfig } from "@/lib/shops/shopify";
import { Badge, Card, CardHeader, Notice, buttonClass, inputClass } from "@/components/ui";
import { disconnectShop, startShopifyConnect, syncShopsNow } from "./shop-actions";

type Params = { shop?: string; added?: string; updated?: string; limited?: string };

function noticeFor(p: Params, tr: Tr): { text: string; tone: "success" | "warning" | "danger" | "info" } | null {
  switch (p.shop) {
    case "connected":
      return { tone: "success", text: tr("Shopify connected. Orders from the last 60 days were imported, and new ones arrive on their own.", "Shopify কানেক্ট হয়েছে। গত ৬০ দিনের অর্ডার চলে এসেছে, নতুন অর্ডার নিজে থেকে আসবে।") };
    case "connected_sync_error":
      return { tone: "warning", text: tr("Shopify connected, but the first import didn't finish. Press Sync now.", "Shopify কানেক্ট হয়েছে, কিন্তু প্রথম অর্ডার আনা শেষ হয়নি। Sync now চাপো।") };
    case "synced": {
      const added = Number(p.added) || 0;
      const updated = Number(p.updated) || 0;
      const limited = Number(p.limited) || 0;
      return {
        tone: limited ? "warning" : "success",
        text:
          tr(`${added} new orders, ${updated} updated.`, `${added}টি নতুন অর্ডার, ${updated}টির অবস্থা বদলেছে।`) +
          (limited ? tr(` ${limited} skipped: monthly order limit reached.`, ` ${limited}টি বাদ পড়েছে: মাসের অর্ডার সীমা শেষ।`) : ""),
      };
    }
    case "bad_domain":
      return { tone: "danger", text: tr("Enter your store address, like my-store.myshopify.com.", "দোকানের ঠিকানা লেখো, যেমন my-store.myshopify.com।") };
    case "denied":
      return { tone: "danger", text: tr("Shopify didn't confirm the connection. Try again.", "Shopify সংযোগ নিশ্চিত করেনি। আবার চেষ্টা করো।") };
    case "no_account":
      return { tone: "warning", text: tr("Pick an ad account in Settings first.", "আগে সেটিংস থেকে Ad Account বেছে নাও।") };
    case "plan":
      return { tone: "warning", text: tr("Store connections are part of the Pro Marketer and Agency plans.", "দোকানের সংযোগ Pro Marketer আর Agency প্ল্যানে আছে।") };
    case "unavailable":
      return { tone: "warning", text: tr("Shopify connection isn't switched on yet.", "Shopify সংযোগ এখনো চালু হয়নি।") };
    case "error":
      return { tone: "warning", text: tr("Couldn't reach Shopify. Try again in a moment.", "Shopify-তে পৌঁছানো যায়নি। একটু পরে আবার চেষ্টা করো।") };
    case "disconnected":
      return { tone: "info", text: tr("Store disconnected. To remove Hook fully, uninstall the app in Shopify too.", "দোকানের সংযোগ বিচ্ছিন্ন হয়েছে। পুরোপুরি সরাতে Shopify থেকেও অ্যাপটি আনইনস্টল করো।") };
    case "missing":
      return { tone: "warning", text: tr("Connect a store first.", "আগে একটা দোকান কানেক্ট করো।") };
    default:
      return null;
  }
}

// অনলাইন দোকান থেকে অর্ডার সরাসরি আনা (এখন Shopify)
export default async function ShopSection({
  shops,
  allowed,
  planName,
  params,
  back,
  accountLabel,
}: {
  shops: ShopConnection[];
  allowed: boolean;
  planName: string;
  params: Params;
  back: string;
  accountLabel: (id: string) => string;
}) {
  const tr = await getTr();
  const notice = noticeFor(params, tr);
  const configured = shopifyConfig() !== null;
  const dhaka = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }) : tr("never", "এখনো হয়নি");

  return (
    <div id="shops" className="mb-6 scroll-mt-6">
      <Card>
        <CardHeader
          icon={Store}
          title={tr("Shopify store", "Shopify দোকান")}
          description={tr(
            "New orders and cancellations arrive on their own, already matched to the campaign from the ad link (utm_id / utm_campaign). Hook only reads orders.",
            "নতুন অর্ডার আর বাতিল হওয়ার খবর নিজে থেকে আসে, বিজ্ঞাপনের লিংক (utm_id / utm_campaign) দেখে ক্যাম্পেইনের সাথে মিলিয়ে। Hook শুধু অর্ডার পড়ে।",
          )}
          action={
            allowed && shops.length > 0 ? (
              <form action={syncShopsNow}>
                <input type="hidden" name="back" value={back} />
                <button type="submit" className={buttonClass("primary", "shrink-0")}>
                  <RefreshCw className="size-4" aria-hidden />
                  {tr("Sync now", "এখনই আনো")}
                </button>
              </form>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-4 p-5 text-sm text-zinc-600 dark:text-zinc-400">
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
          {!allowed ? (
            <p>
              {tr(
                `Store connections are part of the Pro Marketer and Agency plans. You're on ${planName}.`,
                `দোকানের সংযোগ Pro Marketer আর Agency প্ল্যানে আছে। তুমি এখন ${planName} প্ল্যানে।`,
              )}{" "}
              <Link href="/settings#plan" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                {tr("See plans", "প্ল্যান দেখো")}
              </Link>
            </p>
          ) : !configured ? (
            <p>
              {tr(
                "Shopify connection is coming soon. Until then, export orders from Shopify as CSV and import them above.",
                "Shopify সংযোগ শীঘ্রই আসছে। ততদিন Shopify থেকে অর্ডার CSV হিসেবে নামিয়ে উপরে আপলোড করো।",
              )}
            </p>
          ) : (
            <>
              {shops.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                      <span className="truncate">{s.shop_domain}</span>
                      <Badge tone="success">{tr("Connected", "কানেক্টেড")}</Badge>
                    </p>
                    <p className="mt-1 text-xs">
                      {tr("Orders go to", "অর্ডার যায়")}: {accountLabel(s.ad_account_id)} · {tr("Last sync", "শেষ সিঙ্ক")}: {dhaka(s.last_synced_at)} ·{" "}
                      {tr("Last live order", "শেষ লাইভ অর্ডার")}: {dhaka(s.last_webhook_at)}
                    </p>
                  </div>
                  <form action={disconnectShop}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className={buttonClass("danger")}>
                      {tr("Disconnect", "বিচ্ছিন্ন করো")}
                    </button>
                  </form>
                </div>
              ))}
              <form action={startShopifyConnect} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {shops.length ? tr("Add another store", "আরেকটা দোকান যোগ করো") : tr("Your Shopify store address", "তোমার Shopify দোকানের ঠিকানা")}
                  </span>
                  <input name="shop" required placeholder="my-store.myshopify.com" autoComplete="off" spellCheck={false} className={inputClass} />
                </label>
                <button type="submit" className={buttonClass("primary", "shrink-0")}>
                  {tr("Connect Shopify", "Shopify কানেক্ট করো")}
                </button>
              </form>
              <p className="text-xs">
                {tr(
                  "You'll approve read-only access to orders in Shopify. Orders go to the ad account selected now. For campaign matching, add the URL parameters below to your ads.",
                  "Shopify-তে শুধু অর্ডার পড়ার অনুমতি দেবে। অর্ডারগুলো এখন বেছে রাখা Ad Account-এ যাবে। ক্যাম্পেইনের সাথে মেলাতে নিচের URL parameters বিজ্ঞাপনে বসাও।",
                )}
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
