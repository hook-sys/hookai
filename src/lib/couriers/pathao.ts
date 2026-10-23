import { CourierError, courierFetch, mapEventStatus, type CourierStatus } from "./common";

// Pathao Courier merchant API (Aladdin)। ক্রেডেনশিয়াল: Pathao Merchant → Developer API।
// পাসওয়ার্ড শুধু প্রথমবার টোকেন নিতে লাগে, Hook সেটা জমা রাখে না; পরে refresh token দিয়ে নতুন টোকেন আসে।
const BASE_URL = "https://api-hermes.pathao.com/aladdin/api/v1";

export type PathaoCredentials = {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms
};

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function issueToken(body: Record<string, string>) {
  const data = await courierFetch<TokenResponse>(`${BASE_URL}/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    // ভুল তথ্যে Pathao 400/401/422 দেয়
    if (err instanceof CourierError && err.status && err.status < 500) throw new CourierError("Pathao rejected the login", 401);
    throw err;
  });
  if (!data.access_token) throw new CourierError("Pathao returned no token", 401);
  return data;
}

export async function loginPathao(input: {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}): Promise<PathaoCredentials> {
  const data = await issueToken({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    username: input.username,
    password: input.password,
    grant_type: "password",
  });
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// মেয়াদ শেষের এক দিন আগে থেকেই নতুন টোকেন নেওয়া হয়। বদলালে নতুন credential ফেরত দেয় (সেভ করার জন্য)।
export async function freshPathao(c: PathaoCredentials): Promise<PathaoCredentials | null> {
  if (c.expiresAt - Date.now() > 24 * 60 * 60 * 1000) return null;
  if (!c.refreshToken) throw new CourierError("Pathao login expired", 401);
  const data = await issueToken({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
    grant_type: "refresh_token",
  });
  return {
    ...c,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? c.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// Pathao-তে অবস্থা দেখা যায় শুধু consignment ID দিয়ে; ট্র্যাকিং ঘর খালি থাকলে webhook-ই ভরসা
export async function pathaoStatus(
  c: PathaoCredentials,
  order: { tracking_code: string | null },
): Promise<CourierStatus | null> {
  const id = order.tracking_code?.trim();
  if (!id || !/^[A-Za-z0-9-]{4,40}$/.test(id)) return null;
  const data = await courierFetch<{ data?: { order_status?: string; order_status_slug?: string } }>(
    `${BASE_URL}/orders/${encodeURIComponent(id)}/info`,
    { headers: { Authorization: `Bearer ${c.accessToken}`, Accept: "application/json" } },
  );
  return mapEventStatus(data.data?.order_status_slug ?? data.data?.order_status);
}
