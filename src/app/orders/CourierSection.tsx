import Link from "next/link";
import { RefreshCw, Truck } from "lucide-react";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";
import { COURIER_IDS, isCourierId, type CourierId } from "@/lib/couriers/common";
import { COURIER_LABELS, type CourierConnection } from "@/lib/couriers";
import { Badge, Card, CardHeader, Notice, buttonClass } from "@/components/ui";
import { CarrybeeSecretForm, CopyText, CourierConnectForm } from "./OrderForms";
import { disconnectCourier, openCarrybeeSetup, syncCouriersNow } from "./courier-actions";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hook.com.bd").replace(/\/$/, "");

type Params = { courier?: string; checked?: string; updated?: string; rejected?: string; which?: string };

function noticeFor(params: Params, tr: Tr): { text: string; tone: "success" | "warning" | "danger" | "info" } | null {
  const names = (list?: string) =>
    (list ?? "")
      .split(",")
      .filter(isCourierId)
      .map((c) => COURIER_LABELS[c])
      .join(", ");
  switch (params.courier) {
    case "synced": {
      const checked = Number(params.checked) || 0;
      const updated = Number(params.updated) || 0;
      const rejected = names(params.rejected);
      return {
        tone: rejected ? "warning" : "success",
        text:
          tr(`Checked ${checked} open orders, ${updated} updated.`, `${checked}টি চলমান অর্ডার দেখা হয়েছে, ${updated}টির অবস্থা বদলেছে।`) +
          (rejected
            ? tr(` ${rejected} rejected the saved details; reconnect it below.`, ` ${rejected} সেভ করা তথ্য গ্রহণ করছে না; নিচে আবার কানেক্ট করো।`)
            : ""),
      };
    }
    case "error":
      return { tone: "warning", text: tr("Couldn't reach the courier. Try again in a moment.", "কুরিয়ারে পৌঁছানো যায়নি। একটু পরে আবার চেষ্টা করো।") };
    case "disconnected": {
      const name = isCourierId(params.which) ? COURIER_LABELS[params.which] : tr("Courier", "কুরিয়ার");
      return { tone: "info", text: tr(`${name} disconnected. Its details were deleted from Hook.`, `${name} সংযোগ বিচ্ছিন্ন হয়েছে। এর তথ্য Hook থেকে মুছে ফেলা হয়েছে।`) };
    }
    case "setup":
      return { tone: "info", text: tr("Setup open for 10 minutes: press Add Webhook in CarryBee now.", "১০ মিনিটের জন্য সেটআপ খোলা: এখনই CarryBee-তে Add Webhook চাপো।") };
    case "missing":
      return { tone: "warning", text: tr("Connect a courier first.", "আগে একটা কুরিয়ার কানেক্ট করো।") };
    default:
      return null;
  }
}

function readSecret(conn: CourierConnection) {
  try {
    return conn.webhook_token_encrypted ? decrypt(conn.webhook_token_encrypted) : null;
  } catch {
    console.error(`${conn.courier} webhook secret unreadable`);
    return null;
  }
}

function courierText(courier: CourierId, tr: Tr) {
  switch (courier) {
    case "steadfast":
      return {
        where: tr("Steadfast merchant panel → API: API key and Secret key.", "Steadfast মার্চেন্ট প্যানেল → API: API key আর Secret key।"),
        match: tr(
          "Matched by consignment ID, tracking code, or order number = Steadfast invoice.",
          "মেলে কনসাইনমেন্ট ID, ট্র্যাকিং কোড, অথবা অর্ডার নম্বর = Steadfast invoice দিয়ে।",
        ),
        webhook: tr(
          "Steadfast panel → API → Webhook: paste the Callback URL and Auth token, and turn on delivery status notifications.",
          "Steadfast প্যানেল → API → Webhook: Callback URL আর Auth token বসাও, আর ডেলিভারি স্ট্যাটাস নোটিফিকেশন চালু করো।",
        ),
        tokenLabel: "Auth token (Bearer)",
      };
    case "pathao":
      return {
        where: tr(
          "Pathao Merchant → Developer API: Client ID and Client Secret, plus your Pathao login email and password. The password is only used once to get access and is never stored.",
          "Pathao Merchant → Developer API: Client ID আর Client Secret, সাথে Pathao-র লগইন ইমেইল আর পাসওয়ার্ড। পাসওয়ার্ড শুধু একবার অনুমতি নিতে লাগে, Hook কোথাও জমা রাখে না।",
        ),
        match: tr(
          "Matched by consignment ID, or by order number = Pathao merchant order ID (live updates).",
          "মেলে কনসাইনমেন্ট ID দিয়ে, অথবা অর্ডার নম্বর = Pathao merchant order ID হলে (লাইভ আপডেটে)।",
        ),
        webhook: tr(
          "Pathao Merchant → Developer API → Webhook: paste the Callback URL and the Secret, tick all order events, then save.",
          "Pathao Merchant → Developer API → Webhook: Callback URL আর Secret বসাও, সব অর্ডার ইভেন্ট টিক দিয়ে সেভ করো।",
        ),
        tokenLabel: "Secret",
      };
    case "carrybee":
      return {
        where: tr(
          "CarryBee Merchant → API Credentials: Client-ID, Client-Secret and Client-Context.",
          "CarryBee Merchant → API Credentials: Client-ID, Client-Secret আর Client-Context।",
        ),
        match: tr(
          "Matched by consignment ID, or by order number = CarryBee merchant order ID.",
          "মেলে কনসাইনমেন্ট ID দিয়ে, অথবা অর্ডার নম্বর = CarryBee merchant order ID হলে।",
        ),
        webhook: tr(
          "CarryBee → Webhook Integration: paste the Callback URL, copy the integration secret CarryBee shows into the box below and save, then press Add Webhook in CarryBee within 10 minutes (all events ticked).",
          "CarryBee → Webhook Integration: Callback URL বসাও, CarryBee যে integration secret দেখায় সেটা নিচের ঘরে বসিয়ে সেভ করো, তারপর ১০ মিনিটের মধ্যে CarryBee-তে Add Webhook চাপো (সব ইভেন্ট টিক দিয়ে)।",
        ),
        tokenLabel: "Integration secret",
      };
  }
}

// কুরিয়ার সংযোগ: প্রতিটি কুরিয়ারের জন্য কানেক্ট ফর্ম, বা কানেক্ট থাকলে লাইভ আপডেটের ঠিকানা
export default async function CourierSection({
  connections,
  allowed,
  planName,
  params,
  back,
}: {
  connections: CourierConnection[];
  allowed: boolean;
  planName: string;
  params: Params;
  back: string;
}) {
  const tr = await getTr();
  const notice = noticeFor(params, tr);
  const byId = new Map(connections.map((c) => [c.courier, c]));
  const dhaka = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }) : tr("never", "এখনো হয়নি");

  return (
    <div id="couriers" className="mb-6 scroll-mt-6">
      <Card>
        <CardHeader
          icon={Truck}
          title={tr("Courier status", "কুরিয়ার থেকে অবস্থা")}
          description={tr(
            "Delivered, returned and in-transit status comes straight from your courier. Hook only reads parcel status; it never books, changes or cancels parcels.",
            "ডেলিভারি, রিটার্ন আর কুরিয়ারে থাকার খবর সরাসরি তোমার কুরিয়ার থেকে আসে। Hook শুধু পার্সেলের অবস্থা পড়ে; কোনো পার্সেল বুক, বদল বা বাতিল করে না।",
          )}
          action={
            allowed && connections.length > 0 ? (
              <form action={syncCouriersNow}>
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
                `Courier sync is part of the Pro Marketer and Agency plans. You're on ${planName}.`,
                `কুরিয়ার সংযোগ Pro Marketer আর Agency প্ল্যানে আছে। তুমি এখন ${planName} প্ল্যানে।`,
              )}{" "}
              <Link href="/settings#plan" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                {tr("See plans", "প্ল্যান দেখো")}
              </Link>
            </p>
          ) : (
            <div className="grid min-w-0 gap-4 xl:grid-cols-3">
              {COURIER_IDS.map((courier) => {
                const conn = byId.get(courier);
                const text = courierText(courier, tr);
                const name = COURIER_LABELS[courier];
                const secret = conn ? readSecret(conn) : null;
                const url = conn ? `${SITE_URL}/api/webhooks/${courier}/${conn.id}` : null;
                const setupOpen = conn?.webhook_setup_until && new Date(conn.webhook_setup_until) > new Date();
                return (
                  <section key={courier} className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</h3>
                      {conn ? <Badge tone="success">{tr("Connected", "কানেক্টেড")}</Badge> : <Badge>{tr("Not connected", "কানেক্ট নেই")}</Badge>}
                    </div>
                    <p className="text-xs">{text.match}</p>

                    {!conn || !url ? (
                      <>
                        <p className="text-xs">{text.where}</p>
                        <CourierConnectForm courier={courier} />
                      </>
                    ) : (
                      <>
                        <p className="text-xs">
                          {tr("Last sync", "শেষ সিঙ্ক")}: {dhaka(conn.last_synced_at)}
                          <br />
                          {tr("Last live update", "শেষ লাইভ আপডেট")}: {dhaka(conn.last_webhook_at)}
                        </p>
                        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{tr("Live updates", "লাইভ আপডেট")}</p>
                          <p className="text-xs">{text.webhook}</p>
                          <span className="text-xs font-medium">Callback URL</span>
                          <CopyText text={url} />
                          {courier === "carrybee" ? (
                            <>
                              <CarrybeeSecretForm hasSecret={Boolean(secret)} />
                              {secret && (
                                <form action={openCarrybeeSetup}>
                                  <button type="submit" className={buttonClass("ghost", "px-0 text-xs")} disabled={Boolean(setupOpen)}>
                                    {setupOpen
                                      ? tr("Setup open: press Add Webhook in CarryBee", "সেটআপ খোলা: CarryBee-তে Add Webhook চাপো")
                                      : tr("Open 10-minute setup again", "আবার ১০ মিনিটের সেটআপ খোলো")}
                                  </button>
                                </form>
                              )}
                            </>
                          ) : (
                            secret && (
                              <>
                                <span className="text-xs font-medium">{text.tokenLabel}</span>
                                <CopyText text={secret} secret />
                              </>
                            )
                          )}
                        </div>
                        <details className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                          <summary className="cursor-pointer text-xs font-medium">
                            {tr("Change details or disconnect", "তথ্য বদলাও বা সংযোগ বিচ্ছিন্ন করো")}
                          </summary>
                          <div className="mt-3 flex flex-col gap-3">
                            <CourierConnectForm courier={courier} update />
                            <form action={disconnectCourier}>
                              <input type="hidden" name="courier" value={courier} />
                              <button type="submit" className={buttonClass("danger", "px-0")}>
                                {tr(`Disconnect ${name}`, `${name} সংযোগ বিচ্ছিন্ন করো`)}
                              </button>
                            </form>
                          </div>
                        </details>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
