import { NextResponse, type NextRequest } from "next/server";
import { checkSite, diffSnapshots, type SiteSnapshot } from "@/lib/competitors/site";
import { createPublicClient } from "@/lib/supabase/public";
import { runForUser, type UserSnapshot } from "@/lib/rules/runner";
import { decrypt } from "@/lib/crypto";
import { buildEvents, sendCapiEvents, type CapiOrder } from "@/lib/capi";

type CapiClient = {
  client_id: string;
  pixel_id: string;
  website_url: string | null;
  send_confirmed: boolean;
  send_delivered: boolean;
  token: string;
  orders: CapiOrder[];
};

// প্রতি ঘণ্টায় Supabase pg_cron এখানে POST করে (x-cron-secret header সহ, key আসে Supabase Vault থেকে)।
// key-এর hash ডাটাবেসে মিলিয়ে দেখা হয়; ভুল হলে ডাটাবেস কোনো ডাটা দেয় না।
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const got = request.headers.get("x-cron-secret") ?? "";
  if (!/^[0-9a-f]{64}$/.test(got)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("cron_snapshot", { p_secret: got });
  if (error) {
    if (/unauthorized/i.test(error.message)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error("cron snapshot failed", error.message);
    return NextResponse.json({ error: "snapshot" }, { status: 500 });
  }

  const users = (data ?? []) as UserSnapshot[];
  const summaries = [];
  for (const u of users) {
    try {
      const s = await runForUser(
        u,
        {
          write: async (events, alerts, ruleIds) => {
            const { data: fresh, error: wErr } = await supabase.rpc("cron_write", {
              p_secret: got,
              p_user: u.user_id,
              p_events: events,
              p_alerts: alerts,
              p_rule_ids: ruleIds,
            });
            if (wErr) throw new Error(`write: ${wErr.message}`);
            return (fresh ?? []) as { id: string; title: string; body: string | null }[];
          },
          markSent: async (ids, err) => {
            await supabase.rpc("cron_mark_sent", { p_secret: got, p_ids: ids, p_error: err });
          },
        },
        { dryRun: false },
      );
      // লগে বিজ্ঞাপনের নাম বা টোকেন যায় না, শুধু সংখ্যা
      summaries.push({ accounts: s.accounts, checked: s.checked, actions: s.actions, alerts: s.alerts, whatsapp: s.whatsapp, errors: s.errors.length });
      if (s.errors.length) console.error("cron rules errors", s.errors);
    } catch (err) {
      console.error("cron rules user failed", err instanceof Error ? err.message : err);
      summaries.push({ failed: true });
    }
  }
  // Conversions API: কনফার্ম/ডেলিভারি হওয়া অর্ডার Meta-কে জানানো
  const capi = [];
  const { data: pending, error: pErr } = await supabase.rpc("cron_capi_pending", { p_secret: got });
  if (pErr) console.error("capi pending failed", pErr.message);
  for (const c of (pending ?? []) as CapiClient[]) {
    const { events, confirmedIds, deliveredIds } = buildEvents(c.orders, {
      sendConfirmed: c.send_confirmed,
      sendDelivered: c.send_delivered,
      websiteUrl: c.website_url,
    });
    let error: string | null = null;
    let received = 0;
    if (events.length) {
      try {
        received = await sendCapiEvents(decrypt(c.token), c.pixel_id, events);
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 300) : "send failed";
      }
    }
    await supabase.rpc("cron_capi_mark", {
      p_secret: got,
      p_client: c.client_id,
      p_confirmed: error ? [] : confirmedIds,
      p_delivered: error ? [] : deliveredIds,
      p_error: error,
    });
    capi.push({ events: events.length, received, failed: Boolean(error) });
  }

  // প্রতিযোগীর ওয়েবসাইট: প্রতি ঘণ্টায় ৪টা করে, প্রত্যেকটা দিনে একবার; আগের ছবির সাথে মিলিয়ে কী বদলাল
  const { data: due, error: dErr } = await supabase.rpc("cron_competitors_due", { p_secret: got, p_limit: 4 });
  if (dErr) console.error("competitors due failed", dErr.message);
  let competitors = 0;
  for (const c of (due ?? []) as { id: string; website_url: string; prev: SiteSnapshot | null }[]) {
    const r = await checkSite(c.website_url);
    await supabase.rpc("cron_competitor_save", {
      p_secret: got,
      p_id: c.id,
      p_status: r.status,
      p_error: r.status === "ok" ? null : r.error,
      p_platform: r.status === "ok" ? r.snapshot.platform : null,
      p_data: r.status === "ok" ? r.snapshot : null,
      p_changes: r.status === "ok" ? diffSnapshots(c.prev, r.snapshot) : [],
    });
    competitors++;
  }

  return NextResponse.json({ ok: true, users: summaries, capi, competitors });
}
