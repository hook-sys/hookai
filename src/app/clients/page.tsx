import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Plus, Store, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { currentClient } from "@/lib/clients";
import { adAccountOptions } from "@/lib/meta/accountsCache";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import ClientForm, { DeleteClientButton, type AccountChoice } from "./ClientForm";

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Clients", "ক্লায়েন্ট") };
}

// ক্লায়েন্ট (ব্র্যান্ড) সাজানো: নাম, কোন কোন Ad Account তার; দোকান ও কুরিয়ার Orders পাতা থেকে কানেক্ট হয়
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const tr = makeTr(await getLocale());
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ client: current, clients, accounts }, menu, { data: shops }, { data: couriers }] = await Promise.all([
    currentClient(supabase, user.id),
    adAccountOptions(supabase, user.id),
    supabase.from("shop_connections").select("client_id, shop_domain, platform").eq("user_id", user.id),
    supabase.from("courier_connections").select("client_id, courier").eq("user_id", user.id),
  ]);
  const owner = new Map(accounts.map((a) => [a.ad_account_id, clients.find((c) => c.id === a.client_id)?.name ?? null]));
  const choicesFor = (clientId?: string): AccountChoice[] =>
    (menu?.accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      active: a.active,
      ownerName: accounts.find((x) => x.ad_account_id === a.id && x.client_id !== clientId) ? owner.get(a.id) ?? null : null,
    }));

  return (
    <AppShell active="clients">
      <PageHeader
        title={tr("Clients", "ক্লায়েন্ট")}
        description={tr(
          "Each client has its own ad accounts, website and courier. Pick a client at the top of any page; Orders then shows only that client.",
          "প্রতিটা ক্লায়েন্টের নিজের Ad Account, ওয়েবসাইট আর কুরিয়ার। যেকোনো পাতার উপর থেকে ক্লায়েন্ট বাছো; তখন Orders পাতায় শুধু সেই ক্লায়েন্টের হিসাব দেখায়।",
        )}
      />
      {deleted && <Notice tone="info">{tr("Client deleted.", "ক্লায়েন্ট মুছে ফেলা হয়েছে।")}</Notice>}

      <div className="mb-6 flex flex-col gap-4">
        {clients.map((c) => {
          const own = accounts.filter((a) => a.client_id === c.id);
          const cShops = (shops ?? []).filter((s) => s.client_id === c.id);
          const cCouriers = (couriers ?? []).filter((s) => s.client_id === c.id);
          return (
            <Card key={c.id}>
              <CardHeader
                icon={Building2}
                title={c.name}
                description={tr(`${own.length} ad accounts`, `${own.length}টি Ad Account`)}
                action={c.id === current?.id ? <Badge tone="brand">{tr("Selected", "বাছা আছে")}</Badge> : undefined}
              />
              <div className="flex flex-col gap-4 p-5 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-zinc-600 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Store className="size-4" aria-hidden />
                    {cShops.length ? cShops.map((s) => s.shop_domain).join(", ") : tr("No website connected", "কোনো ওয়েবসাইট কানেক্ট নেই")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Truck className="size-4" aria-hidden />
                    {cCouriers.length ? cCouriers.map((s) => s.courier).join(", ") : tr("No courier connected", "কোনো কুরিয়ার কানেক্ট নেই")}
                  </span>
                  <Link href="/orders#shops" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                    {tr("Connect website / courier", "ওয়েবসাইট / কুরিয়ার কানেক্ট করো")}
                  </Link>
                </div>
                <details>
                  <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">{tr("Edit name and ad accounts", "নাম আর Ad Account বদলাও")}</summary>
                  <div className="mt-3 max-w-xl">
                    <ClientForm id={c.id} name={c.name} accounts={choicesFor(c.id)} checked={own.map((a) => a.ad_account_id)} />
                  </div>
                  <DeleteClientButton
                    id={c.id}
                    name={c.name}
                    label={tr("Delete this client (its website and courier connections too)", "এই ক্লায়েন্ট মুছে ফেলো (ওয়েবসাইট আর কুরিয়ার সংযোগসহ)")}
                  />
                </details>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader icon={Plus} title={tr("New client", "নতুন ক্লায়েন্ট")} description={tr("Name it and tick its ad accounts.", "নাম দাও আর তার Ad Account গুলোতে টিক দাও।")} />
        <div className="max-w-xl p-5">
          {(menu?.accounts ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">
              {tr("Connect Meta in Settings first to list your ad accounts.", "Ad Account-এর তালিকা পেতে আগে সেটিংস থেকে Meta কানেক্ট করো।")}
            </p>
          ) : (
            <ClientForm accounts={choicesFor()} checked={[]} />
          )}
        </div>
      </Card>
    </AppShell>
  );
}
