import { notFound, redirect } from "next/navigation";
import { Building2, Link2, Repeat2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient } from "@/lib/clients";
import { PRESETS, listAudiences, presetName, type Audience } from "@/lib/meta/audiences";
import { listPixels, listPromotePages } from "@/lib/meta/launch";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui";
import { AudienceRowActions, RetargetingSetForm } from "./AudienceClient";
import ProductAudienceForm from "./ProductAudienceForm";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Audiences", "অডিয়েন্স") };
}

export default async function AudiencesPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: conn } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const scope = await accountInCurrentClient(supabase, user.id, conn?.selected_ad_account_id ?? null);
  if (!conn?.selected_ad_account_id || !scope.ok) {
    return (
      <AppShell active="audiences">
        <PageHeader title={tr("Audiences", "অডিয়েন্স")} />
        <EmptyState
          icon={Building2}
          title={tr("Pick an ad account", "একটা Ad Account বাছো")}
          text={tr("Choose the client's ad account from the menu at the top.", "উপরের মেনু থেকে ক্লায়েন্টের Ad Account বাছো।")}
        />
      </AppShell>
    );
  }
  const accountId = conn.selected_ad_account_id;
  const token = decrypt(conn.access_token_encrypted);

  let audiences: Audience[] = [];
  let loadError = false;
  const [list, pixels, pages] = await Promise.all([
    listAudiences(token, accountId).catch(() => null),
    listPixels(token, accountId).catch(() => []),
    listPromotePages(token, accountId).catch(() => []),
  ]);
  if (list) audiences = list;
  else loadError = true;

  const names = new Set(audiences.map((a) => a.name));
  // কোন সেট-অডিয়েন্স কোন Pixel/পেজের জন্য আগে থেকে আছে, ফর্মে দেখানোর জন্য
  const existingFor = Object.fromEntries(
    [...pixels.map((p) => ({ id: p.id, label: p.name })), ...pages.map((p) => ({ id: p.id, label: p.name }))].map((src) => [
      src.id,
      PRESETS.filter((pr) => names.has(presetName(pr, src.label))).map((pr) => pr.id),
    ]),
  );

  const typeLabel = (s: string) =>
    s === "WEBSITE" ? tr("Website", "ওয়েবসাইট") : s === "ENGAGEMENT" ? tr("Engagement", "এনগেজমেন্ট") : s === "LOOKALIKE" ? "Lookalike" : s === "CUSTOM" ? tr("Customer list", "কাস্টমার লিস্ট") : s;
  const size = (a: Audience) =>
    a.sizeLow === null ? "—" : a.sizeHigh && a.sizeHigh !== a.sizeLow ? `${a.sizeLow.toLocaleString("en-US")}–${a.sizeHigh.toLocaleString("en-US")}` : a.sizeLow.toLocaleString("en-US");

  return (
    <AppShell active="audiences">
      <PageHeader
        title={tr("Audiences", "অডিয়েন্স")}
        description={tr(
          `${conn.selected_ad_account_name ?? accountId} · retarget people who already know you, and find more like your buyers`,
          `${conn.selected_ad_account_name ?? accountId} · যারা আগে থেকে চেনে তাদের আবার দেখাও, আর ক্রেতাদের মতো নতুন মানুষ খোঁজো`,
        )}
      />
      {loadError && <Notice tone="warning">{tr("Couldn't load audiences from Meta. Try again shortly.", "Meta থেকে অডিয়েন্স আনা যায়নি। একটু পরে আবার চেষ্টা করো।")}</Notice>}

      {/* প্রোডাক্ট ধরে অডিয়েন্স: সবচেয়ে বেশি ব্যবহার হয়, তাই উপরে */}
      <Card className="mb-6">
        <CardHeader
          icon={Link2}
          title={tr("Audiences from a product link", "প্রোডাক্টের লিংক থেকে অডিয়েন্স")}
          description={tr(
            "Paste a link: Hook finds the ads for it and makes video viewer (25/50/75/95%, ThruPlay) and website audiences in one go.",
            "লিংক দাও: Hook সেই লিংকের বিজ্ঞাপন খুঁজে ভিডিও দর্শক (২৫/৫০/৭৫/৯৫%, ThruPlay) আর ওয়েবসাইটের অডিয়েন্স একবারে বানাবে।",
          )}
        />
        <div className="max-w-3xl p-5">
          <ProductAudienceForm pixels={pixels.map((p) => ({ id: p.id, name: p.name, active: Boolean(p.last_fired_time) }))} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader
            icon={Users}
            title={tr(`Audiences in this account (${audiences.length})`, `এই অ্যাকাউন্টের অডিয়েন্স (${audiences.length})`)}
            description={tr("Use them in New ad: include to retarget, exclude buyers from new-customer ads.", "নতুন বিজ্ঞাপনে ব্যবহার করো: রিটার্গেটে যোগ করো, নতুন ক্রেতার বিজ্ঞাপন থেকে ক্রেতাদের বাদ দাও।")}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tr("Name", "নাম")}</th>
                  <th className="px-3 py-2 font-medium">{tr("Type", "ধরন")}</th>
                  <th className="px-3 py-2 text-right font-medium">{tr("Size", "আকার")}</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.07]">
                {audiences.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2.5">
                      <span className="block max-w-[22rem] truncate font-medium">{a.name}</span>
                      {a.status && <span className="block text-xs text-amber-600">{a.status.slice(0, 90)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={a.subtype === "LOOKALIKE" ? "brand" : "neutral"}>{typeLabel(a.subtype)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{size(a)}</td>
                    <td className="px-5 py-2.5">
                      <AudienceRowActions id={a.id} name={a.name} canLookalike={a.subtype !== "LOOKALIKE"} />
                    </td>
                  </tr>
                ))}
                {audiences.length === 0 && !loadError && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-zinc-500">
                      {tr("No audiences yet. Make a retargeting set on the right.", "এখনো কোনো অডিয়েন্স নেই। ডান পাশ থেকে রিটার্গেটিং সেট বানাও।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="self-start">
          <CardHeader
            icon={Repeat2}
            title={tr("One-click retargeting set", "এক ক্লিকে রিটার্গেটিং সেট")}
            description={tr("Ready-made audiences for every step of the buying journey.", "কেনার প্রতিটি ধাপের জন্য তৈরি অডিয়েন্স।")}
          />
          <div className="p-5">
            <RetargetingSetForm
              pixels={pixels.map((p) => ({ id: p.id, name: p.name, active: Boolean(p.last_fired_time) }))}
              pages={pages}
              existingFor={existingFor}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
