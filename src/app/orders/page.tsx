import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, Link2Off, PackageCheck, Plus, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { ensureCoverage } from "@/lib/insights/sync";
import { listConnections } from "@/lib/couriers";
import { listShops } from "@/lib/shops";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { addDays, formatRange, resolveRange, todayIn } from "@/lib/dates";
import { formatMoney, formatNumber } from "@/lib/format";
import { getUserPlan, planMinDate } from "@/lib/plans";
import {
  COURIER_NAMES,
  URL_PARAMETERS,
  campaignOutcomes,
  deliveryRate,
  knownCampaigns,
  loadOrders,
  statusLabel,
  type OrderStatus,
} from "@/lib/orders";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, buttonClass, cn } from "@/components/ui";
import DateRangePicker from "@/app/dashboard/DateRangePicker";
import { AddOrderForm, CopyText, ImportOrdersForm, StatusSelect } from "./OrderForms";
import CourierSection from "./CourierSection";
import ShopSection from "./ShopSection";
import { deleteOrder } from "./actions";

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Orders", "অর্ডার") };
}

type Props = {
  searchParams: Promise<{
    preset?: string;
    since?: string;
    until?: string;
    campaign?: string;
    courier?: string;
    checked?: string;
    updated?: string;
    rejected?: string;
    which?: string;
    shop?: string;
    added?: string;
    limited?: string;
  }>;
};

const STATUS_TONES: Record<OrderStatus, "neutral" | "success" | "warning" | "danger" | "brand"> = {
  pending: "neutral",
  confirmed: "brand",
  shipped: "warning",
  delivered: "success",
  cancelled: "danger",
  returned: "danger",
};

const ORDER_LIST_LIMIT = 200;

// কোন ক্যাম্পেইন থেকে কয়টা অর্ডার এসেছে, কয়টা কনফার্ম, ডেলিভারি বা ক্যানসেল হলো
export default async function OrdersPage({ searchParams }: Props) {
  const locale = await getLocale();
  const tr = makeTr(locale);
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, selected_ad_account_timezone, insights_synced_from")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.selected_ad_account_id) {
    return (
      <AppShell active="orders">
        <PageHeader title={tr("Orders", "অর্ডার")} />
        <EmptyState
          icon={Link2Off}
          title={tr("Connect Meta and pick an ad account", "Meta কানেক্ট করে Ad Account বেছে নাও")}
          text={tr(
            "Orders are matched to the campaigns of your selected ad account.",
            "অর্ডারগুলো তোমার বেছে নেওয়া Ad Account-এর ক্যাম্পেইনের সাথে মেলানো হয়।",
          )}
          action={
            <Link href="/settings" className={buttonClass("primary")}>
              {tr("Go to Settings", "সেটিংসে যাও")}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const accountId = connection.selected_ad_account_id;
  const currency = connection.selected_ad_account_currency;
  const timeZone = connection.selected_ad_account_timezone;
  const today = todayIn(timeZone);
  const plan = await getUserPlan(supabase, user.id);
  const minDate = planMinDate(plan, today);
  // ডিফল্ট: আজসহ গত ৩০ দিন, যাতে আজকের অর্ডারও দেখা যায়
  const noDates = !params.preset && !params.since;
  const resolved = resolveRange(
    noDates
      ? { since: addDays(today, -29), until: today }
      : { preset: params.preset, since: params.since, until: params.until || params.since },
    today,
    tr,
    minDate,
  );
  const range = noDates ? { ...resolved, label: tr("Last 30 days incl. today", "আজসহ গত ৩০ দিন") } : resolved;
  const since = range.preset === "maximum" ? minDate : range.since;
  const until = range.until;

  // খরচের হিসাবের জন্য এই তারিখের বিজ্ঞাপন ডাটা Hook-এ না থাকলে Meta থেকে আনে
  let spendWarning: string | null = null;
  const expired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();
  if (!expired) {
    try {
      await ensureCoverage(
        { supabase, userId: user.id, token: decrypt(connection.access_token_encrypted), accountId },
        since,
        connection.insights_synced_from,
        timeZone,
      );
    } catch (err) {
      console.error("orders spend sync failed", err instanceof Error ? err.message : err);
      spendWarning = tr("Couldn't fetch ad spend for all these dates from Meta.", "এই তারিখের সব বিজ্ঞাপন খরচ Meta থেকে আনা যায়নি।");
    }
  }

  const [orders, campaigns, connections, shops] = await Promise.all([
    loadOrders(supabase, user.id, accountId, { since, until }),
    knownCampaigns(supabase, user.id, accountId),
    listConnections(supabase, user.id),
    listShops(supabase, user.id),
  ]);
  const { rows, total } = await campaignOutcomes(supabase, user.id, accountId, { since, until }, orders, tr);

  const filter = params.campaign;
  const listed = orders
    .filter((o) => !filter || (filter === "none" ? o.campaign_id === null : o.campaign_id === filter))
    .slice(0, ORDER_LIST_LIMIT);
  const filterName = filter ? rows.find((r) => (r.campaignId ?? "none") === filter)?.name : null;
  const baseQuery = range.preset === "custom" ? `since=${since}&until=${until}` : `preset=${range.preset}`;
  // অর্ডারের টাকা টাকায়; বিজ্ঞাপন খরচও টাকায় হলে তবেই ROAS তুলনা করা যায়
  const sameCurrency = currency === "BDT";
  const taka = (v: number) => `৳${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const rate = deliveryRate(total);
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const open = total.orders - total.delivered - total.cancelled - total.returned;

  const kpis = [
    { k: tr("Orders", "অর্ডার"), v: formatNumber(total.orders), sub: taka(total.orderValue) },
    { k: tr("Confirmed", "কনফার্ম"), v: formatNumber(total.confirmed), sub: total.orders ? pct(total.confirmed / total.orders) : "—" },
    { k: tr("Delivered", "ডেলিভারি"), v: formatNumber(total.delivered), sub: taka(total.deliveredValue) },
    { k: tr("Cancelled", "ক্যানসেল"), v: formatNumber(total.cancelled), sub: tr(`${total.returned} returned`, `${total.returned}টি রিটার্ন`) },
    { k: tr("Delivery rate", "ডেলিভারি রেট"), v: pct(rate), sub: tr(`${open} still open`, `${open}টি এখনো চলমান`) },
    {
      k: tr("Cost per delivered", "প্রতি ডেলিভারি খরচ"),
      v: total.delivered ? formatMoney(total.spend / total.delivered, currency) : "—",
      sub: tr(`Ad spend ${formatMoney(total.spend, currency)}`, `বিজ্ঞাপন খরচ ${formatMoney(total.spend, currency)}`),
    },
  ];

  return (
    <AppShell active="orders">
      <PageHeader
        title={tr("Orders", "অর্ডার")}
        description={
          <>
            {connection.selected_ad_account_name ?? accountId} · {range.label}: {formatRange(since, until)}
          </>
        }
        actions={
          <DateRangePicker
            key={`${range.preset}-${since}-${until}`}
            preset={range.preset}
            label={range.label}
            since={since}
            until={until}
            today={today}
            minDate={minDate}
            keepParams={filter ? { campaign: filter } : {}}
            basePath="/orders"
          />
        }
      />

      {spendWarning && <Notice tone="warning">{spendWarning}</Notice>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((x) => (
          <Card key={x.k} className="p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{x.k}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{x.v}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{x.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          icon={PackageCheck}
          title={tr("Orders by campaign", "ক্যাম্পেইন অনুযায়ী অর্ডার")}
          description={tr(
            "Orders placed in this period and where they stand now. Delivery rate counts only orders that have finished (delivered, cancelled or returned).",
            "এই সময়ে আসা অর্ডার আর সেগুলোর এখনকার অবস্থা। ডেলিভারি রেটে শুধু শেষ হওয়া অর্ডার গোনা হয় (ডেলিভারি, ক্যানসেল বা রিটার্ন)।",
          )}
        />
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            {tr("No orders or ad spend in this period yet. Add orders below.", "এই সময়ে এখনো কোনো অর্ডার বা বিজ্ঞাপন খরচ নেই। নিচে অর্ডার যোগ করো।")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{tr("Campaign", "ক্যাম্পেইন")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Spend", "খরচ")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Orders", "অর্ডার")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Confirmed", "কনফার্ম")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Delivered", "ডেলিভারি")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Cancelled", "ক্যানসেল")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Returned", "রিটার্ন")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Delivery rate", "ডেলিভারি রেট")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Cost / delivered", "খরচ / ডেলিভারি")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{sameCurrency ? tr("Delivered ROAS", "ডেলিভারি ROAS") : tr("Delivered ৳", "ডেলিভারি ৳")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((r) => {
                  const dr = deliveryRate(r);
                  const key = r.campaignId ?? "none";
                  return (
                    <tr key={key} className={cn(filter === key && "bg-indigo-50/60 dark:bg-indigo-950/40")}>
                      <td className="max-w-72 px-5 py-3">
                        <Link
                          href={`/orders?${baseQuery}&campaign=${key}#order-list`}
                          className={cn("block truncate font-medium hover:underline", r.campaignId ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 italic")}
                          title={r.name}
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.campaignId ? formatMoney(r.spend, currency) : "—"}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{formatNumber(r.orders)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(r.confirmed)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(r.delivered)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatNumber(r.cancelled)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600 dark:text-red-400">{formatNumber(r.returned)}</td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-medium tabular-nums",
                          dr === null ? "text-zinc-400" : dr >= 0.75 ? "text-emerald-700 dark:text-emerald-400" : dr < 0.5 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {pct(dr)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.campaignId && r.delivered ? formatMoney(r.spend / r.delivered, currency) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {sameCurrency
                          ? r.spend > 0
                            ? `${(r.deliveredValue / r.spend).toFixed(2)}x`
                            : "—"
                          : taka(r.deliveredValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Plus} title={tr("Add an order", "অর্ডার যোগ করো")} description={tr("For Messenger, WhatsApp or phone orders.", "মেসেঞ্জার, WhatsApp বা ফোনের অর্ডারের জন্য।")} />
          <div className="p-5">
            <AddOrderForm campaigns={campaigns} today={today} />
          </div>
        </Card>
        <Card>
          <CardHeader icon={Upload} title={tr("Import from CSV", "CSV থেকে আপলোড")} description={tr("Export orders from Shopify, WooCommerce or your sheet.", "Shopify, WooCommerce বা তোমার শিট থেকে অর্ডার নামিয়ে আপলোড করো।")} />
          <div className="p-5">
            <ImportOrdersForm />
          </div>
        </Card>
      </div>

      <ShopSection
        shops={shops}
        allowed={plan.courierSync}
        planName={plan.name}
        params={params}
        back={`/orders?${baseQuery}`}
        accountLabel={(id) => (id === accountId ? (connection.selected_ad_account_name ?? id) : id)}
      />

      <CourierSection
        connections={connections}
        allowed={plan.courierSync}
        planName={plan.name}
        params={params}
        back={`/orders?${baseQuery}`}
      />

      <Card className="mb-6">
        <CardHeader
          icon={Link2}
          title={tr("Let website orders find their campaign", "ওয়েবসাইটের অর্ডার যেন নিজের ক্যাম্পেইন চিনে নেয়")}
          description={tr(
            "Paste this into the URL parameters field of every ad (Ads Manager → Ad → Destination → URL parameters). Meta fills in the real campaign ID on each click.",
            "প্রতিটা বিজ্ঞাপনের URL parameters ঘরে এটা বসাও (Ads Manager → Ad → Destination → URL parameters)। প্রতিটা ক্লিকে Meta নিজে আসল ক্যাম্পেইন ID বসিয়ে দেয়।",
          )}
        />
        <div className="flex flex-col gap-3 p-5 text-sm text-zinc-600 dark:text-zinc-400">
          <CopyText text={URL_PARAMETERS} />
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {tr(
                "Shopify and WooCommerce save these values with each order. Export orders as CSV and keep the utm_id or utm_campaign column, then import here.",
                "Shopify আর WooCommerce প্রতিটা অর্ডারের সাথে এই তথ্য রাখে। অর্ডার CSV হিসেবে নামানোর সময় utm_id বা utm_campaign কলাম রেখে এখানে আপলোড করো।",
              )}
            </li>
            <li>
              {tr(
                "Direct Shopify, WooCommerce and custom-site connections are coming next, so new orders arrive on their own.",
                "Shopify, WooCommerce আর নিজের সাইটের সরাসরি সংযোগ আসছে, তখন নতুন অর্ডার নিজে থেকে চলে আসবে।",
              )}
            </li>
          </ul>
        </div>
      </Card>

      <div id="order-list" className="scroll-mt-6">
      <Card className="overflow-hidden">
        <CardHeader
          title={filterName ? tr(`Orders: ${filterName}`, `অর্ডার: ${filterName}`) : tr("All orders", "সব অর্ডার")}
          description={tr(
            `${listed.length} shown${listed.length === ORDER_LIST_LIMIT ? " (latest only)" : ""}. Change a status and it saves at once.`,
            `${listed.length}টি দেখানো হচ্ছে${listed.length === ORDER_LIST_LIMIT ? " (শুধু সর্বশেষগুলো)" : ""}। অবস্থা বদলালেই সেভ হয়।`,
          )}
          action={
            filter ? (
              <Link href={`/orders?${baseQuery}#order-list`} className={buttonClass("ghost")}>
                {tr("Show all", "সব দেখাও")}
              </Link>
            ) : undefined
          }
        />
        {listed.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">{tr("No orders yet.", "এখনো কোনো অর্ডার নেই।")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{tr("Order", "অর্ডার")}</th>
                  <th className="px-3 py-2.5 font-medium">{tr("Date", "তারিখ")}</th>
                  <th className="px-3 py-2.5 font-medium">{tr("Campaign", "ক্যাম্পেইন")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Amount", "টাকা")}</th>
                  <th className="px-3 py-2.5 font-medium">{tr("Courier", "কুরিয়ার")}</th>
                  <th className="px-3 py-2.5 font-medium">{tr("Status", "অবস্থা")}</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {listed.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-2.5 font-mono text-xs">{o.external_id}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatRange(o.order_date, o.order_date)}</td>
                    <td className="max-w-60 truncate px-3 py-2.5" title={o.campaign_name ?? undefined}>
                      {o.campaign_name ?? <span className="text-zinc-400">—</span>}
                      {o.campaign_name && !o.campaign_id && (
                        <span className="ml-1">
                          <Badge tone="warning">{tr("not matched", "মেলেনি")}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{taka(o.amount)}</td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">
                      {o.courier ? COURIER_NAMES[o.courier] : "—"}
                      {o.tracking_code && <span className="block font-mono">{o.tracking_code}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_TONES[o.status]}>{statusLabel(o.status, tr)}</Badge>
                        <StatusSelect id={o.id} status={o.status} label={tr(`Change status of order ${o.external_id}`, `অর্ডার ${o.external_id}-এর অবস্থা বদলাও`)} />
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <form action={deleteOrder}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" aria-label={tr(`Delete order ${o.external_id}`, `অর্ডার ${o.external_id} মুছে ফেলো`)} className={buttonClass("danger", "px-2 py-1")}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
    </AppShell>
  );
}
