"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTr } from "@/lib/i18n-server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/providers";
import { currentClient } from "@/lib/clients";
import { loadClientProfile } from "@/lib/clientProfile";
import { normalizeSiteUrl } from "@/lib/meta/assets";
import { checkSite, diffSnapshots, type SiteSnapshot } from "@/lib/competitors/site";
import { parseAdLibrary, type LibAnalysis } from "@/lib/competitors/adlib";
import { buildReport } from "@/lib/competitors/report";
import { todayIn } from "@/lib/dates";

export type CompState = { ok: true; message: string } | { ok: false; error: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

async function ctx() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can do this.", "শুধু মালিক এটা করতে পারে।") } as const;
  const { client } = await currentClient(supabase, user.id);
  return { tr, supabase, user, client };
}

async function ownCompetitor(c: Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await c.supabase.from("competitors").select("id, name, website_url").eq("id", id).eq("user_id", c.user.id).maybeSingle();
  return data;
}

// ওয়েবসাইট দেখে ছবি রাখা আর আগেরটার সাথে মিলিয়ে কী বদলাল লেখা
async function refresh(c: Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>, id: string, url: string) {
  const { data: prev } = await c.supabase
    .from("competitor_snapshots")
    .select("data")
    .eq("competitor_id", id)
    .eq("kind", "site")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = await checkSite(url);
  if (r.status === "ok") {
    await c.supabase.from("competitor_snapshots").insert({ competitor_id: id, user_id: c.user.id, kind: "site", data: r.snapshot });
    const changes = diffSnapshots((prev?.data as SiteSnapshot) ?? null, r.snapshot);
    if (changes.length) {
      await c.supabase.from("competitor_changes").insert(changes.map((ch) => ({ ...ch, competitor_id: id, user_id: c.user.id })));
    }
  }
  await c.supabase
    .from("competitors")
    .update({
      last_checked_at: new Date().toISOString(),
      site_status: r.status,
      last_error: r.status === "ok" ? null : r.error,
      ...(r.status === "ok" ? { platform: r.snapshot.platform } : {}),
    })
    .eq("id", id);
  return r;
}

export async function addCompetitor(_prev: CompState, formData: FormData): Promise<CompState> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error ?? "" };
  const { tr } = c;
  if (!c.client) return { ok: false, error: tr("Pick a client first.", "আগে ক্লায়েন্ট বাছো।") };
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const rawSite = String(formData.get("website_url") ?? "").trim();
  const query = String(formData.get("ad_library_query") ?? "").trim().slice(0, 200);
  if (!name) return { ok: false, error: tr("Give the competitor a name.", "প্রতিযোগীর নাম দাও।") };
  const site = rawSite ? normalizeSiteUrl(rawSite) : null;
  if (rawSite && !site) return { ok: false, error: tr("Check the website address.", "ওয়েবসাইটের ঠিকানা ঠিক করো।") };
  const { data, error } = await c.supabase
    .from("competitors")
    .insert({ user_id: c.user.id, client_id: c.client.id, name, website_url: site, ad_library_query: query || name })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: tr("Couldn't save.", "সংরক্ষণ হয়নি।") };
  // প্রথমবার এখনই দেখা, যাতে সাথে সাথে ফল দেখা যায়
  const r = site ? await refresh(c, data.id, site) : null;
  revalidatePath("/competitors");
  return {
    ok: true,
    message:
      r?.status === "blocked"
        ? tr(`${name} added. Its website blocks automatic checks; use the Ad Library part.`, `${name} যোগ হয়েছে। তাদের ওয়েবসাইট স্বয়ংক্রিয় দেখা আটকায়; Ad Library অংশটা ব্যবহার করো।`)
        : tr(`${name} added.`, `${name} যোগ হয়েছে।`),
  };
}

export async function deleteCompetitor(formData: FormData) {
  const c = await ctx();
  if ("error" in c) return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await c.supabase.from("competitors").delete().eq("id", id).eq("user_id", c.user.id);
  revalidatePath("/competitors");
}

export async function refreshCompetitor(_prev: CompState, formData: FormData): Promise<CompState> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error ?? "" };
  const comp = await ownCompetitor(c, String(formData.get("id") ?? ""));
  if (!comp?.website_url) return { ok: false, error: c.tr("No website for this competitor.", "এই প্রতিযোগীর ওয়েবসাইট নেই।") };
  const r = await refresh(c, comp.id, comp.website_url);
  revalidatePath("/competitors");
  if (r.status === "ok") return { ok: true, message: c.tr(`${r.snapshot.products.length} products read.`, `${r.snapshot.products.length}টা প্রোডাক্ট পড়া হয়েছে।`) };
  return { ok: false, error: r.status === "blocked" ? c.tr("This website blocks automatic checks.", "এই ওয়েবসাইট স্বয়ংক্রিয় দেখা আটকায়।") : r.error };
}

// Ad Library-র পাতা কপি করে পেস্ট: বিজ্ঞাপনের হিসাব রাখা, আগেরবারের সাথে নতুন/বন্ধ বিজ্ঞাপন মেলানো
export async function analyzeAds(_prev: CompState, formData: FormData): Promise<CompState> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error ?? "" };
  const { tr } = c;
  const comp = await ownCompetitor(c, String(formData.get("id") ?? ""));
  if (!comp) return { ok: false, error: tr("Competitor not found.", "প্রতিযোগী পাওয়া যায়নি।") };
  const text = String(formData.get("text") ?? "").slice(0, 600_000);
  const a = parseAdLibrary(text, todayIn("Asia/Dhaka"));
  if (a.ads.length === 0) {
    return {
      ok: false,
      error: tr(
        "No ads found in the paste. Open the Ad Library page, scroll down a bit, press Ctrl+A then Ctrl+C, and paste here. Keep Facebook in English.",
        "পেস্টে কোনো বিজ্ঞাপন পাওয়া যায়নি। Ad Library পাতা খুলে একটু নিচে স্ক্রল করো, Ctrl+A তারপর Ctrl+C চেপে এখানে পেস্ট করো। Facebook ইংরেজিতে রাখো।",
      ),
    };
  }
  const { data: prev } = await c.supabase
    .from("competitor_snapshots")
    .select("data")
    .eq("competitor_id", comp.id)
    .eq("kind", "ads")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await c.supabase.from("competitor_snapshots").insert({ competitor_id: comp.id, user_id: c.user.id, kind: "ads", data: a });
  const before = new Set(((prev?.data as LibAnalysis | null)?.ads ?? []).map((x) => x.id));
  if (before.size) {
    const now = new Set(a.ads.map((x) => x.id));
    const added = a.ads.filter((x) => !before.has(x.id));
    const gone = [...before].filter((id) => !now.has(id));
    const rows = [
      ...(added.length ? [{ kind: "new_ads", title: `${added.length} new ads`, detail: added.slice(0, 5).map((x) => x.body.slice(0, 80)).join(" · ") }] : []),
      ...(gone.length ? [{ kind: "stopped_ads", title: `${gone.length} ads no longer in the list`, detail: null }] : []),
    ];
    if (rows.length) await c.supabase.from("competitor_changes").insert(rows.map((r) => ({ ...r, competitor_id: comp.id, user_id: c.user.id })));
  }
  revalidatePath("/competitors");
  return { ok: true, message: tr(`${a.ads.length} ads analysed.`, `${a.ads.length}টা বিজ্ঞাপন বিশ্লেষণ হয়েছে।`) };
}

// সব প্রতিযোগী মিলিয়ে AI রিপোর্ট
// useActionState দুটো মান পাঠায়, এখানে লাগে না
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function makeReport(_prev: CompState, _formData: FormData): Promise<CompState> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error ?? "" };
  const { tr } = c;
  if (!c.client) return { ok: false, error: tr("Pick a client first.", "আগে ক্লায়েন্ট বাছো।") };
  const { data: comps } = await c.supabase.from("competitors").select("id, name").eq("user_id", c.user.id).eq("client_id", c.client.id);
  if (!comps?.length) return { ok: false, error: tr("Add competitors first.", "আগে প্রতিযোগী যোগ করো।") };

  const latest = async (id: string, kind: "site" | "ads") =>
    (
      await c.supabase
        .from("competitor_snapshots")
        .select("data")
        .eq("competitor_id", id)
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.data ?? null;
  const inputs = await Promise.all(
    comps.map(async (x) => {
      const { data: ch } = await c.supabase.from("competitor_changes").select("title").eq("competitor_id", x.id).order("created_at", { ascending: false }).limit(8);
      return { name: x.name, site: (await latest(x.id, "site")) as SiteSnapshot | null, ads: (await latest(x.id, "ads")) as LibAnalysis | null, changes: (ch ?? []).map((r) => r.title) };
    }),
  );
  if (inputs.every((i) => !i.site && !i.ads)) {
    return { ok: false, error: tr("No data yet: add websites or paste Ad Library pages first.", "এখনো তথ্য নেই: আগে ওয়েবসাইট দাও বা Ad Library পেস্ট করো।") };
  }
  const prof = await loadClientProfile(c.supabase, c.user.id, c.client.id);
  const own = prof?.website_url ? await checkSite(prof.website_url) : null;
  try {
    const { report, model, cost } = await buildReport(c.supabase, {
      clientName: c.client.name,
      profile: prof?.profile,
      clientSite: own?.status === "ok" ? own.snapshot : null,
      competitors: inputs,
    });
    await c.supabase.from("competitor_reports").insert({ user_id: c.user.id, client_id: c.client.id, content: report, model, cost_usd: cost });
  } catch (err) {
    return { ok: false, error: err instanceof AiError || err instanceof Error ? err.message.slice(0, 200) : "error" };
  }
  revalidatePath("/competitors");
  return { ok: true, message: tr("Report ready.", "রিপোর্ট তৈরি।") };
}
