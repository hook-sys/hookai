// Meta Graph API-র সাথে যোগাযোগ। সব ভার্সন এক জায়গায়, পরিবর্তন করা সহজ।
const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Meta ধীর হলে পেজ যেন অনির্দিষ্টকাল আটকে না থাকে
const REQUEST_TIMEOUT_MS = 10_000;

// এখনকার জন্য শুধু পড়ার অনুমতি; বিজ্ঞাপন বদলানোর অনুমতি ধাপ ৭-এ যুক্ত হবে
export const META_SCOPES = ["ads_read"];

export class MetaApiError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} সেট করা নেই`);
  return value;
}

type GraphOptions = {
  method?: "GET" | "DELETE";
  params?: Record<string, string>;
  // টোকেন URL-এ না দিয়ে Authorization header-এ পাঠানো হয়, যাতে লগে না আসে
  token?: string;
};

async function graphRequest<T>(path: string, options: GraphOptions = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries(options.params ?? {}).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.token
        ? { Authorization: `Bearer ${options.token}` }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MetaApiError("Meta থেকে সময়মতো উত্তর আসেনি। একটু পরে আবার চেষ্টা করো।");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new MetaApiError(body?.error?.message ?? "Meta API ত্রুটি");
  }
  return body as T;
}

export function buildAuthUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", requireEnv("META_APP_ID"));
  url.searchParams.set("redirect_uri", requireEnv("META_REDIRECT_URI"));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

// কোড দিয়ে স্বল্পমেয়াদি টোকেন (Meta-র নির্দেশিত পদ্ধতি; শুধু সার্ভার থেকে ডাকা হয়)
export async function exchangeCodeForToken(code: string) {
  return graphRequest<{ access_token: string }>("/oauth/access_token", {
    params: {
      client_id: requireEnv("META_APP_ID"),
      client_secret: requireEnv("META_APP_SECRET"),
      redirect_uri: requireEnv("META_REDIRECT_URI"),
      code,
    },
  });
}

// স্বল্পমেয়াদি টোকেনকে দীর্ঘমেয়াদি (প্রায় ৬০ দিন) টোকেনে রূপান্তর
export async function exchangeForLongLivedToken(shortToken: string) {
  return graphRequest<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      params: {
        grant_type: "fb_exchange_token",
        client_id: requireEnv("META_APP_ID"),
        client_secret: requireEnv("META_APP_SECRET"),
        fb_exchange_token: shortToken,
      },
    },
  );
}

export async function getMeta(token: string) {
  return graphRequest<{ id: string; name: string }>("/me", {
    params: { fields: "id,name" },
    token,
  });
}

// ব্যবহারকারী সংযোগ বিচ্ছিন্ন করলে Meta-তেও অনুমতি বাতিল করে, যাতে টোকেন অকেজো হয়
export async function revokePermissions(token: string) {
  return graphRequest<{ success: boolean }>("/me/permissions", {
    method: "DELETE",
    token,
  });
}

export type AdAccount = {
  id: string; // যেমন act_123456
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1 = ACTIVE
};

// অনেক Ad Account থাকলে cursor ধরে পরের পাতাগুলোও আনে (সর্বোচ্চ MAX_PAGES পাতা)
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export async function getAdAccounts(token: string) {
  const accounts: AdAccount[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await graphRequest<{
      data: AdAccount[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/me/adaccounts", {
      params: {
        fields: "id,name,currency,timezone_name,account_status",
        limit: String(PAGE_SIZE),
        ...(after ? { after } : {}),
      },
      token,
    });

    accounts.push(...res.data);
    after = res.paging?.cursors?.after;
    if (!res.paging?.next || !after) break;
  }

  return accounts;
}

export const AD_ACCOUNT_ID_PATTERN = /^act_\d{1,20}$/;

export async function getAdAccount(token: string, accountId: string) {
  return graphRequest<AdAccount>(`/${accountId}`, {
    params: { fields: "id,name,currency,timezone_name,account_status" },
    token,
  });
}

export type MetaAction = { action_type: string; value: string };

export type CampaignInsightRow = {
  campaign_id: string;
  campaign_name: string;
  date_start: string; // YYYY-MM-DD, Ad Account-এর টাইমজোনে
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

// গত ৩০ দিনের (আজ বাদে) ক্যাম্পেইন-লেভেলের দৈনিক ডাটা
const INSIGHTS_MAX_PAGES = 20;

export async function getCampaignInsightsDaily(token: string, accountId: string) {
  const rows: CampaignInsightRow[] = [];
  let after: string | undefined;

  for (let page = 0; page < INSIGHTS_MAX_PAGES; page++) {
    const res = await graphRequest<{
      data: CampaignInsightRow[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${accountId}/insights`, {
      params: {
        level: "campaign",
        time_increment: "1",
        date_preset: "last_30d",
        fields:
          "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
        limit: "500",
        ...(after ? { after } : {}),
      },
      token,
    });

    rows.push(...res.data);
    after = res.paging?.cursors?.after;
    if (!res.paging?.next || !after) break;
  }

  return rows;
}
