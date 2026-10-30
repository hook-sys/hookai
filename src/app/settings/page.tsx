import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Megaphone, UserCircle2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getAdAccounts, type AdAccount } from "@/lib/meta/graph";
import { getTr } from "@/lib/i18n-server";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { disconnectMeta } from "./actions";
import AdAccountPicker from "./AdAccountPicker";
import DeleteAccount from "./DeleteAccount";
import PlanCard from "./PlanCard";
import ClientsManager from "@/app/clients/ClientsManager";
import { getUserPlan } from "@/lib/plans";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Settings", "সেটিংস") };
}

type Props = { searchParams: Promise<{ meta?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const tr = await getTr();
  const MESSAGES: Record<string, { text: string; tone: "success" | "warning" | "danger" }> = {
    connected: {
      text: tr(
        "Your Meta account is connected. Now pick an ad account below.",
        "Meta অ্যাকাউন্ট সফলভাবে কানেক্ট হয়েছে। এবার নিচে একটি Ad Account বেছে নাও।",
      ),
      tone: "success",
    },
    denied: { text: tr("Meta permission was declined.", "Meta অনুমতি বাতিল করা হয়েছে।"), tone: "warning" },
    invalid: { text: tr("We couldn't verify the connection. Please try again.", "সংযোগ যাচাই করা যায়নি। আবার চেষ্টা করো।"), tone: "danger" },
    error: {
      text: tr("Something went wrong connecting to Meta. Please try again shortly.", "Meta সংযোগে সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।"),
      tone: "danger",
    },
  };

  const { meta } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware সাধারণত আটকায়, তবে Supabase-এ সাময়িক সমস্যা হলেও যেন পেজ না ভাঙে
  if (!user) {
    redirect("/login");
  }

  const { data: connection } = await supabase
    .from("meta_connections")
    .select(
      "meta_user_name, access_token_encrypted, token_expires_at, selected_ad_account_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // টোকেন শুধু সার্ভারে ব্যবহার হয়, ব্রাউজারে কখনো যায় না
  let adAccounts: AdAccount[] = [];
  let fetchError: string | null = null;
  const expired =
    connection?.token_expires_at &&
    new Date(connection.token_expires_at) < new Date();

  if (connection && !expired) {
    try {
      adAccounts = await getAdAccounts(decrypt(connection.access_token_encrypted));
    } catch (err) {
      fetchError = err instanceof Error ? err.message : tr("Couldn't load ad accounts", "Ad Account আনা যায়নি");
    }
  }

  const notice = meta ? MESSAGES[meta] : undefined;
  // ক্লায়েন্ট থাকলে Ad Account বাছা হয় উপরের মেনু থেকে, আর কোন অ্যাকাউন্ট কোন ক্লায়েন্টের তা নিচের ক্লায়েন্ট অংশে
  const { count: clientCount } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const hasClients = (clientCount ?? 0) > 0;
  const expiresOn = connection?.token_expires_at
    ? new Date(connection.token_expires_at).toLocaleDateString("en-GB")
    : null;

  return (
    <AppShell active="settings">
      <PageHeader
        title={tr("Settings", "সেটিংস")}
        description={tr(
          "Your Meta connection and which ad account the dashboard shows",
          "Meta সংযোগ ও কোন Ad Account-এর হিসাব দেখবে তা ঠিক করো",
        )}
      />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <PlanCard supabase={supabase} userId={user.id} plan={await getUserPlan(supabase, user.id)} tr={tr} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              icon={Megaphone}
              title={tr("Meta account", "Meta অ্যাকাউন্ট")}
              description={tr("Facebook and Instagram ad data", "Facebook ও Instagram বিজ্ঞাপনের ডাটা")}
            />
            <div className="flex flex-col gap-4 px-5 py-5">
              {!connection && (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tr(
                      "Not connected yet. Once connected we only read your ad data and never change anything.",
                      "এখনো কানেক্ট করা নেই। কানেক্ট করলে আমরা শুধু তোমার বিজ্ঞাপনের ডাটা পড়ব, কোনো পরিবর্তন করব না।",
                    )}
                  </p>
                  <Link href="/api/meta/connect" className={buttonClass("primary", "w-fit")}>
                    {tr("Connect Meta account", "Meta অ্যাকাউন্ট কানেক্ট করো")}
                  </Link>
                </>
              )}

              {connection && expired && (
                <>
                  <Badge tone="warning">{tr("Expired", "মেয়াদ শেষ")}</Badge>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tr(
                      "For security, the Meta connection has to be renewed every so often.",
                      "নিরাপত্তার জন্য Meta সংযোগ কিছুদিন পর পর নবায়ন করতে হয়।",
                    )}
                  </p>
                  <Link href="/api/meta/connect" className={buttonClass("primary", "w-fit")}>
                    {tr("Reconnect", "আবার কানেক্ট করো")}
                  </Link>
                </>
              )}

              {connection && !expired && (
                <>
                  <div className="flex items-center gap-3">
                    <UserCircle2 className="size-10 text-zinc-400" aria-hidden />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {connection.meta_user_name}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        {tr("Connected", "সংযুক্ত")}
                        {expiresOn && tr(` · valid until ${expiresOn}`, ` · ${expiresOn} পর্যন্ত বৈধ`)}
                      </p>
                    </div>
                  </div>
                  {/* নতুন অনুমতি লাগলে (যেমন পেজে পোস্ট প্রকাশ) সংযোগ না ভেঙে আবার অনুমতি নেওয়া */}
                  <div className="flex flex-col gap-1">
                    <Link href="/api/meta/connect" className={buttonClass("secondary", "w-fit")}>
                      {tr("Update Facebook permissions", "Facebook-এর অনুমতি হালনাগাদ করো")}
                    </Link>
                    <p className="text-xs text-zinc-400">
                      {tr("Needed once for new features, like publishing ad posts on the page.", "নতুন সুবিধার জন্য একবার লাগে, যেমন বিজ্ঞাপনের পোস্ট পেজে প্রকাশ।")}
                    </p>
                  </div>
                  <form action={disconnectMeta} className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <button type="submit" className={buttonClass("danger", "-ml-4")}>
                      {tr("Disconnect", "সংযোগ বিচ্ছিন্ন করো")}
                    </button>
                    <p className="mt-1 text-xs text-zinc-400">
                      {tr("Stored ad data is deleted too.", "সংরক্ষিত বিজ্ঞাপনের ডাটাও মুছে যাবে।")}
                    </p>
                  </form>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={UserCircle2} title={tr("Your account", "তোমার অ্যাকাউন্ট")} />
            <div className="flex flex-col gap-4 px-5 py-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("Signed in as ", "লগইন করা আছে: ")}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.email}</span>
              </p>
              <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <DeleteAccount email={user.email ?? ""} />
                <p className="mt-1 text-xs text-zinc-400">
                  {tr("See exactly what gets deleted on the ", "কী কী মোছা হয়, বিস্তারিত দেখো ")}
                  <Link href="/data-deletion" className="underline">
                    {tr("data deletion page", "ডাটা মুছে ফেলার নিয়ম")}
                  </Link>
                  {tr(".", "-এ।")}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {hasClients ? null : (
        <Card>
          <CardHeader
            icon={Wallet}
            title="Ad Account"
            description={tr("Which ad account the dashboard shows", "ড্যাশবোর্ডে কোন Ad Account-এর হিসাব দেখাবে")}
          />
          <div className="px-5 py-5">
            {!connection || expired ? (
              <p className="text-sm text-zinc-500">{tr("Connect your Meta account first.", "আগে Meta অ্যাকাউন্ট কানেক্ট করো।")}</p>
            ) : fetchError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
            ) : adAccounts.length === 0 ? (
              <p className="text-sm text-zinc-500">{tr("No ad accounts found on this profile.", "এই অ্যাকাউন্টে কোনো Ad Account পাওয়া যায়নি।")}</p>
            ) : (
              <AdAccountPicker
                accounts={adAccounts}
                selectedId={connection.selected_ad_account_id}
              />
            )}
          </div>
        </Card>
        )}
      </div>

      {connection && !expired && (
        <div className="mt-8">
          <ClientsManager supabase={supabase} userId={user.id} tr={tr} />
        </div>
      )}
    </AppShell>
  );
}
