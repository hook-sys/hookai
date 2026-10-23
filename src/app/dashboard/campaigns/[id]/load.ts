import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getCampaignInfo } from "@/lib/meta/graph";
import { cached, loadLiveReport } from "@/lib/insights/live";
import { earliestDataDate } from "@/lib/insights/report";
import { minAllowedDate, resolveRange, todayIn } from "@/lib/dates";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";

const CAMPAIGN_ID_PATTERN = /^\d{5,25}$/;

// পেজ ও action দুটোই একই যাচাই করে: লগইন, সংযোগ, আর ক্যাম্পেইনটি নির্বাচিত Ad Account-এর কিনা
export async function loadCampaignContext(
  campaignId: string,
  params: { preset?: string; since?: string; until?: string },
) {
  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) notFound();
  const locale = await getLocale();
  const tr = makeTr(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: connection } = await supabase
    .from("meta_connections")
    .select(
      "access_token_encrypted, token_expires_at, selected_ad_account_id, selected_ad_account_currency, selected_ad_account_timezone",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const expired =
    connection?.token_expires_at && new Date(connection.token_expires_at) < new Date();
  if (!connection?.selected_ad_account_id || expired) redirect("/dashboard");

  const accountId = connection.selected_ad_account_id;
  const currency = connection.selected_ad_account_currency;
  const timeZone = connection.selected_ad_account_timezone;
  const today = todayIn(timeZone);
  const ctx = { supabase, userId: user.id, token: decrypt(connection.access_token_encrypted), accountId };

  // অন্য Ad Account-এর ক্যাম্পেইন হলে (যেমন সেটিংসে Ad Account বদলানোর পর পুরনো লিংক) ডাটা দেখানো হয় না
  const info = await cached(ctx, `campaign:${campaignId}:info`, today, today, today, () =>
    getCampaignInfo(ctx.token, campaignId),
  ).catch(() => null);
  if (!info) notFound();
  if (`act_${info.account_id}` !== accountId) redirect("/dashboard?status=campaign_other_account");

  const range = resolveRange(
    { preset: params.preset, since: params.since, until: params.until || params.since },
    today,
    tr,
  );
  const since =
    range.preset === "maximum"
      ? ((await earliestDataDate(supabase, user.id, accountId)) ?? minAllowedDate(today))
      : range.since;
  const until = range.until;

  const live = await loadLiveReport(ctx, { since, until }, today, currency);
  const campaign = live.campaigns.find((c) => c.id === campaignId) ?? null;

  return { supabase, user, ctx, accountId, currency, today, range, since, until, info, campaign, locale, tr };
}
