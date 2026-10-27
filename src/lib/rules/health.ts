import { graphGetAll, graphRequest } from "@/lib/meta/graph";
import { todayIn } from "@/lib/dates";
import type { AccountInfo, NewAlert } from "./engine";

// অ্যাকাউন্টের স্বাস্থ্য: অ্যাকাউন্ট বন্ধ/পেমেন্ট আটকানো, বিজ্ঞাপন বাতিল, চালু বিজ্ঞাপনের Pixel থেমে যাওয়া।
// অ্যাকাউন্ট আর Pixel-এর সমস্যা দিনে একবার, বিজ্ঞাপনের সমস্যা একবারই জানানো হয়।

const ACCOUNT_STATUS: Record<number, [string, "warning" | "critical"]> = {
  2: ["অ্যাকাউন্ট বন্ধ (Disabled)", "critical"],
  3: ["পেমেন্ট বাকি (Unsettled): কার্ডে টাকা কাটা যায়নি", "critical"],
  7: ["Meta রিস্ক রিভিউ করছে", "warning"],
  8: ["পেমেন্ট সেটেলমেন্ট বাকি", "critical"],
  9: ["গ্রেস পিরিয়ডে আছে: শিগগিরই পেমেন্ট দাও", "warning"],
  100: ["অ্যাকাউন্ট বন্ধ হওয়ার পথে", "critical"],
  101: ["অ্যাকাউন্ট বন্ধ (Closed)", "critical"],
};

type ProblemAd = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign?: { name?: string };
  issues_info?: { error_message?: string; error_summary?: string }[];
  ad_review_feedback?: { global?: Record<string, string> };
};

type PixelAdSet = { id: string; name: string; promoted_object?: { pixel_id?: string } };

export async function checkAccountHealth(token: string, account: AccountInfo): Promise<NewAlert[]> {
  const day = todayIn(account.timezone);
  const alerts: NewAlert[] = [];
  const acc = account.id;

  const st = ACCOUNT_STATUS[account.status];
  if (st) {
    alerts.push({
      ad_account_id: acc,
      kind: "account_status",
      severity: st[1],
      title: `⚠️ ${account.name}: ${st[0]}`,
      body: "Ads Manager → Billing বা Account Quality দেখো। এই অবস্থায় বিজ্ঞাপন চলবে না।",
      dedupe_key: `account:${acc}:${account.status}:${day}`,
    });
    // বন্ধ অ্যাকাউন্টে আর কিছু দেখার মানে নেই
    if (account.status === 2 || account.status === 101) return alerts;
  }

  // বাতিল বা সমস্যাওয়ালা বিজ্ঞাপন
  try {
    const ads = await graphGetAll<ProblemAd>(
      `/${acc}/ads`,
      {
        fields: "id,name,status,effective_status,campaign{name},issues_info,ad_review_feedback",
        effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]),
        limit: "100",
      },
      token,
      3,
    );
    // শুধু যে বিজ্ঞাপন চালু রাখা আছে (পুরোনো বন্ধগুলো নয়)
    for (const ad of ads.filter((a) => a.status === "ACTIVE")) {
      const reason =
        Object.values(ad.ad_review_feedback?.global ?? {})[0] ??
        ad.issues_info?.[0]?.error_summary ??
        ad.issues_info?.[0]?.error_message ??
        "";
      alerts.push({
        ad_account_id: acc,
        kind: "ad_rejected",
        severity: "critical",
        title: ad.effective_status === "DISAPPROVED" ? `❌ বিজ্ঞাপন বাতিল: ${ad.name}` : `⚠️ বিজ্ঞাপনে সমস্যা: ${ad.name}`,
        body: `${account.name}${ad.campaign?.name ? ` · ${ad.campaign.name}` : ""}${reason ? ` · ${reason.slice(0, 300)}` : ""}`,
        // একই বিজ্ঞাপনের একই সমস্যা একবারই জানানো হয়
        dedupe_key: `ad:${ad.id}:${ad.effective_status}`,
      });
    }
  } catch (err) {
    console.error("health ads failed", acc, err instanceof Error ? err.message : err);
  }

  // চালু Sales Ad Set যে Pixel ব্যবহার করে, তাতে ২৪ ঘণ্টা কোনো event না এলে
  try {
    const sets = await graphGetAll<PixelAdSet>(
      `/${acc}/adsets`,
      { fields: "id,name,promoted_object", effective_status: JSON.stringify(["ACTIVE"]), limit: "200" },
      token,
      3,
    );
    const pixelIds = [...new Set(sets.map((s) => s.promoted_object?.pixel_id).filter((x): x is string => !!x))];
    for (const pid of pixelIds) {
      const px = await graphRequest<{ id: string; name: string; last_fired_time?: string }>(`/${pid}`, {
        params: { fields: "id,name,last_fired_time" },
        token,
      }).catch(() => null);
      if (!px) continue;
      const last = px.last_fired_time ? new Date(px.last_fired_time).getTime() : 0;
      if (Date.now() - last > 24 * 3600_000) {
        alerts.push({
          ad_account_id: acc,
          kind: "pixel_stale",
          severity: "critical",
          title: `📉 Pixel থেমে আছে: ${px.name}`,
          body: `${account.name}-এর চালু বিজ্ঞাপন এই Pixel-এ Purchase খুঁজছে, কিন্তু ২৪ ঘণ্টায় কোনো event আসেনি${last ? ` (শেষ: ${new Date(last).toISOString().slice(0, 10)})` : ""}। ওয়েবসাইটে Pixel ঠিক আছে কিনা দেখো।`,
          dedupe_key: `pixel:${pid}:${day}`,
        });
      }
    }
  } catch (err) {
    console.error("health pixel failed", acc, err instanceof Error ? err.message : err);
  }

  return alerts;
}
