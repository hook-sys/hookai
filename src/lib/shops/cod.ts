import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { shopifyGraphql } from "./shopify";

// দোকানের নিজস্ব COD ফর্ম: ক্রেতা দোকানের পাতায় ফর্ম পূরণ করে, Shopify app proxy (/apps/hook/cod) হয়ে
// এখানে আসে। দাম, ডেলিভারি চার্জ আর স্টক সবসময় সার্ভারে Shopify থেকে নেওয়া হয়, ফর্মের কথায় বিশ্বাস নয়।

export type CodSettings = { dhaka: number; outside: number };

export type CodInput = {
  variantId: string;
  quantity: number;
  name: string;
  phone: string;
  address: string;
  area: "dhaka" | "outside";
  note: string;
  attributes: { key: string; value: string }[];
};

// app proxy-র query: signature বাদে বাকি প্যারামিটার নামের ক্রমে সাজিয়ে "key=value" জোড়া (মাঝে কিছু ছাড়া),
// একই নামের একাধিক মান কমা দিয়ে; তারপর app secret দিয়ে HMAC-SHA256 hex
export function verifyProxySignature(params: URLSearchParams, secret: string) {
  const signature = params.get("signature") ?? "";
  const grouped = new Map<string, string[]>();
  for (const [k, v] of params.entries()) {
    if (k === "signature") continue;
    grouped.set(k, [...(grouped.get(k) ?? []), v]);
  }
  const message = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, vs]) => `${k}=${vs.join(",")}`)
    .join("");
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// ডাটাবেসে route-কে চেনার চাবি; আলাদা গোপন মান না রেখে টোকেন-এনক্রিপশন key থেকে বানানো
export function codProxyKey() {
  const hex = process.env.META_TOKEN_ENCRYPTION_KEY ?? "";
  return createHmac("sha256", hex).update("cod-proxy-v1").digest("hex");
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// ফর্মের তথ্য যাচাই; ভুল থাকলে ক্রেতাকে দেখানোর মতো বাংলা বার্তা
export function parseCodInput(body: Record<string, unknown>): { ok: true; input: CodInput } | { ok: false; error: string } {
  const variantId = String(body.variant_id ?? "").replace(/\D/g, "");
  const quantity = Math.floor(Number(body.quantity) || 1);
  const name = clean(body.name, 80);
  const phoneDigits = String(body.phone ?? "").replace(/[^\d]/g, "").replace(/^(?:00)?88/, "");
  const address = clean(body.address, 300);
  const area = body.area === "dhaka" ? "dhaka" : body.area === "outside" ? "outside" : null;
  if (!variantId) return { ok: false, error: "প্রোডাক্টের সাইজ/রঙ বেছে নিন।" };
  if (quantity < 1 || quantity > 5) return { ok: false, error: "একবারে ১ থেকে ৫টি অর্ডার করা যাবে।" };
  if (name.length < 2) return { ok: false, error: "আপনার নাম লিখুন।" };
  if (!/^01[3-9]\d{8}$/.test(phoneDigits)) return { ok: false, error: "সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (যেমন 017XXXXXXXX)।" };
  if (address.length < 8) return { ok: false, error: "পূর্ণ ঠিকানা লিখুন (বাসা, রোড, এলাকা, জেলা)।" };
  if (!area) return { ok: false, error: "ঢাকার ভেতরে না বাইরে, বেছে নিন।" };
  const rawAttrs = typeof body.attributes === "object" && body.attributes ? (body.attributes as Record<string, unknown>) : {};
  const attributes = Object.entries(rawAttrs)
    .filter(([k]) => /^(utm_[a-z]+|fbclid|fbc|fbp|landing_page|referrer)$/.test(k))
    .map(([key, v]) => ({ key, value: clean(v, 500) }))
    .filter((a) => a.value);
  return {
    ok: true,
    input: { variantId, quantity, name, phone: phoneDigits, address, area, note: clean(body.note, 300), attributes },
  };
}

type VariantData = {
  productVariant: {
    id: string;
    price: string;
    title: string;
    availableForSale: boolean;
    product: { title: string; status: string };
  } | null;
};

const VARIANT_QUERY = `
query V($id: ID!) {
  productVariant(id: $id) { id price title availableForSale product { title status } }
}`;

const ORDER_MUTATION = `
mutation C($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order { id name totalPriceSet { shopMoney { amount } } }
    userErrors { field message }
  }
}`;

export async function createCodOrder(shop: string, accessToken: string, settings: CodSettings, input: CodInput) {
  const v = (await shopifyGraphql<VariantData>(shop, accessToken, VARIANT_QUERY, { id: `gid://shopify/ProductVariant/${input.variantId}` }))
    .productVariant;
  if (!v || v.product.status !== "ACTIVE") return { ok: false as const, error: "প্রোডাক্টটি পাওয়া যায়নি।" };
  if (!v.availableForSale) return { ok: false as const, error: "দুঃখিত, এই সাইজ/রঙ এখন স্টকে নেই।" };

  const shipping = input.area === "dhaka" ? settings.dhaka : settings.outside;
  const money = (n: number) => ({ shopMoney: { amount: n.toFixed(2), currencyCode: "BDT" } });
  const [firstName, ...rest] = input.name.split(" ");
  const phone = `+88${input.phone}`;
  const data: {
    orderCreate: { order: { id: string; name: string; totalPriceSet: { shopMoney: { amount: string } } } | null; userErrors: { message: string }[] };
  } = await shopifyGraphql(shop, accessToken, ORDER_MUTATION, {
    order: {
      currency: "BDT",
      lineItems: [{ variantId: v.id, quantity: input.quantity, priceSet: money(Number(v.price)) }],
      shippingLines: [{ title: input.area === "dhaka" ? "ঢাকার ভেতরে ডেলিভারি" : "ঢাকার বাইরে ডেলিভারি", priceSet: money(shipping) }],
      shippingAddress: {
        firstName: rest.length ? firstName : "",
        lastName: rest.length ? rest.join(" ") : firstName,
        address1: input.address,
        city: input.area === "dhaka" ? "Dhaka" : "Outside Dhaka",
        countryCode: "BD",
        phone,
      },
      phone,
      financialStatus: "PENDING",
      tags: ["Hook COD"],
      note: input.note || null,
      customAttributes: [{ key: "cod_form", value: "hook" }, ...input.attributes],
    },
    options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false },
  });
  const order = data.orderCreate.order;
  if (!order) {
    console.error("cod orderCreate", data.orderCreate.userErrors.map((e) => e.message).join("; "));
    return { ok: false as const, error: "অর্ডার নেওয়া যায়নি, একটু পরে আবার চেষ্টা করুন।" };
  }
  return { ok: true as const, order: { id: order.id, name: order.name, total: Number(order.totalPriceSet.shopMoney.amount) } };
}
