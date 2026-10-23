import { CourierError, courierFetch, mapEventStatus, type CourierStatus } from "./common";

// CarryBee Delivery API v2। প্রতিটি অনুরোধে Client-ID, Client-Secret ও Client-Context header লাগে।
// ক্রেডেনশিয়াল: CarryBee Merchant → API Credentials।
const BASE_URL = "https://developers.carrybee.com/api/v2";

export type CarrybeeCredentials = { clientId: string; clientSecret: string; clientContext: string };

type Envelope<T> = { error?: boolean; message?: string; data?: T };

async function cbGet<T>(c: CarrybeeCredentials, path: string) {
  const json = await courierFetch<Envelope<T>>(`${BASE_URL}${path}`, {
    headers: {
      "Client-ID": c.clientId,
      "Client-Secret": c.clientSecret,
      "Client-Context": c.clientContext,
      Accept: "application/json",
    },
  });
  if (json.error) throw new CourierError(json.message ?? "CarryBee error", 422);
  return json.data;
}

// ক্রেডেনশিয়াল যাচাই: স্টোরের তালিকা চাওয়া (কিছু বদলায় না)
export async function checkCarrybee(c: CarrybeeCredentials) {
  await cbGet<unknown>(c, "/stores");
}

// consignment ID বা দোকানের অর্ডার নম্বর (merchant_order_id) দুটো দিয়েই খোঁজা যায়
export async function carrybeeStatus(
  c: CarrybeeCredentials,
  order: { external_id: string; tracking_code: string | null },
): Promise<CourierStatus | null> {
  const ref = order.tracking_code?.trim() || order.external_id;
  const data = await cbGet<{ transfer_status?: string }>(c, `/orders/${encodeURIComponent(ref)}/details`);
  // CarryBee এই অবস্থার শব্দগুলো প্রকাশ করেনি; অচেনা হলে কিছু বদলায় না, webhook-ই আসল খবর দেয়
  return mapEventStatus(data?.transfer_status);
}
