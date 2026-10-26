// Meta Graph API-র সাথে যোগাযোগ। সব ভার্সন এক জায়গায়, পরিবর্তন করা সহজ।
const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Meta ধীর হলে পেজ যেন অনির্দিষ্টকাল আটকে না থাকে
const REQUEST_TIMEOUT_MS = 10_000;

// পড়া আর বিজ্ঞাপন চালু-বন্ধ ও বাজেট বদল (ads_management)। অ্যাপ Development mode-এ থাকায়
// শুধু অ্যাপের মালিক/রোলধারীরা এই অনুমতি দিতে পারে।
export const META_SCOPES = ["ads_read", "ads_management"];

export class MetaApiError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

type GraphOptions = {
  method?: "GET" | "DELETE" | "POST";
  params?: Record<string, string>;
  // টোকেন URL-এ না দিয়ে Authorization header-এ পাঠানো হয়, যাতে লগে না আসে
  token?: string;
  // ছবি/ভিডিও আপলোডে বেশি সময় লাগে
  timeoutMs?: number;
};

export async function graphRequest<T>(path: string, options: GraphOptions = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  // POST-এ প্যারামিটার বডিতে যায়, URL-এ নয়
  const isPost = options.method === "POST";
  if (!isPost) {
    Object.entries(options.params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.token
        ? { Authorization: `Bearer ${options.token}` }
        : undefined,
      body: isPost ? new URLSearchParams(options.params ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MetaApiError("Meta didn't answer in time. Please try again shortly.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    // বিজ্ঞাপন তৈরির ভুলে Meta মানুষের পড়ার মতো বার্তা দেয় (error_user_msg)
    throw new MetaApiError(body?.error?.error_user_msg ?? body?.error?.message ?? "Meta API error");
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
  // আগে কোনো অনুমতি না দিয়ে থাকলে (যেমন নতুন যোগ করা ads_management) আবার জিজ্ঞাসা করে
  url.searchParams.set("auth_type", "rerequest");
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

export type CampaignInfo = { id: string; name: string; account_id: string; objective?: string };

// ক্যাম্পেইনটি কোন Ad Account-এর তা যাচাই করতেও লাগে
export async function getCampaignInfo(token: string, campaignId: string) {
  return graphRequest<CampaignInfo>(`/${campaignId}`, {
    params: { fields: "id,name,account_id,objective" },
    token,
  });
}

// cursor ধরে সব পাতা এনে একসাথে দেয় (সর্বোচ্চ maxPages পাতা)
export async function graphGetAll<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  maxPages = 20,
) {
  const items: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await graphRequest<{
      data: T[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(path, { params: { ...params, ...(after ? { after } : {}) }, token });
    items.push(...res.data);
    after = res.paging?.cursors?.after;
    if (!res.paging?.next || !after) break;
  }
  return items;
}

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

// নির্দিষ্ট তারিখের (দুই দিনসহ) ক্যাম্পেইন-লেভেলের দৈনিক ডাটা।
// তারিখ Ad Account-এর টাইমজোনে; লম্বা সময়ের জন্য ডাকার আগে ছোট ভাগে ভাগ করা উচিত।
const INSIGHTS_MAX_PAGES = 100;

export async function getCampaignInsightsDaily(
  token: string,
  accountId: string,
  range: { since: string; until: string },
) {
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
        time_range: JSON.stringify(range),
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
