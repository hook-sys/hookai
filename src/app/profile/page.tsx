import { notFound, redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { accountInCurrentClient } from "@/lib/clients";
import { loadClientProfile } from "@/lib/clientProfile";
import { listPixels, listPromotePages } from "@/lib/meta/launch";
import AppShell from "@/components/AppShell";
import { EmptyState, PageHeader } from "@/components/ui";
import ProfileForm from "./ProfileForm";

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Client profile", "ক্লায়েন্ট প্রোফাইল") };
}

// বেছে রাখা ক্লায়েন্টের প্রোফাইল: নতুন বিজ্ঞাপনের সাধারণ মান আর ব্যবসার তথ্য
export default async function ProfilePage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { data: conn } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted, selected_ad_account_id, selected_ad_account_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  const scope = await accountInCurrentClient(supabase, user.id, conn?.selected_ad_account_id ?? null);
  const client = scope.client ? await loadClientProfile(supabase, user.id, scope.client.id) : null;
  if (!client || !conn?.selected_ad_account_id || !scope.ok) {
    return (
      <AppShell active="profile">
        <PageHeader title={tr("Client profile", "ক্লায়েন্ট প্রোফাইল")} />
        <EmptyState
          icon={Building2}
          title={tr("Pick a client", "একটা ক্লায়েন্ট বাছো")}
          text={tr("Choose the client and one of its ad accounts at the top.", "উপর থেকে ক্লায়েন্ট আর তার একটা Ad Account বাছো।")}
        />
      </AppShell>
    );
  }

  const token = decrypt(conn.access_token_encrypted);
  const [pages, pixels] = await Promise.all([
    listPromotePages(token, conn.selected_ad_account_id).catch(() => []),
    listPixels(token, conn.selected_ad_account_id).catch(() => []),
  ]);

  return (
    <AppShell active="profile">
      <PageHeader
        title={tr(`${client.name} · profile`, `${client.name} · প্রোফাইল`)}
        description={tr(
          "Write it once: every new ad starts from here, and the AI knows the business. Anything you say in a brief still wins.",
          "একবার লিখে রাখো: প্রতিটা নতুন বিজ্ঞাপন এখান থেকে শুরু হবে, AI ব্যবসাটা জানবে। নির্দেশনায় আলাদা কিছু বললে সেটাই মানা হবে।",
        )}
      />
      <div className="max-w-3xl">
        <ProfileForm
          client={client}
          pages={pages.map((p) => ({ id: p.id, name: p.name }))}
          pixels={pixels.map((p) => ({ id: p.id, name: p.name }))}
          currency={conn.selected_ad_account_currency ?? null}
        />
      </div>
    </AppShell>
  );
}
