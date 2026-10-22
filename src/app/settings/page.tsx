import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Megaphone, UserCircle2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getAdAccounts, type AdAccount } from "@/lib/meta/graph";
import AppShell from "@/components/AppShell";
import { Badge, Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { disconnectMeta } from "./actions";
import AdAccountPicker from "./AdAccountPicker";

export const metadata = { title: "সেটিংস" };

const MESSAGES: Record<string, { text: string; tone: "success" | "warning" | "danger" }> = {
  connected: {
    text: "Meta অ্যাকাউন্ট সফলভাবে কানেক্ট হয়েছে। এবার নিচে একটি Ad Account বেছে নাও।",
    tone: "success",
  },
  denied: { text: "Meta অনুমতি বাতিল করা হয়েছে।", tone: "warning" },
  invalid: { text: "সংযোগ যাচাই করা যায়নি। আবার চেষ্টা করো।", tone: "danger" },
  error: { text: "Meta সংযোগে সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।", tone: "danger" },
};

type Props = { searchParams: Promise<{ meta?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
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
      fetchError = err instanceof Error ? err.message : "Ad Account আনা যায়নি";
    }
  }

  const notice = meta ? MESSAGES[meta] : undefined;
  const expiresOn = connection?.token_expires_at
    ? new Date(connection.token_expires_at).toLocaleDateString("en-GB")
    : null;

  return (
    <AppShell active="settings">
      <PageHeader title="সেটিংস" description="Meta সংযোগ ও কোন Ad Account-এর হিসাব দেখবে তা ঠিক করো" />

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Megaphone} title="Meta অ্যাকাউন্ট" description="Facebook ও Instagram বিজ্ঞাপনের ডাটা" />
            <div className="flex flex-col gap-4 px-5 py-5">
              {!connection && (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    এখনো কানেক্ট করা নেই। কানেক্ট করলে আমরা শুধু তোমার বিজ্ঞাপনের ডাটা পড়ব, কোনো
                    পরিবর্তন করব না।
                  </p>
                  <Link href="/api/meta/connect" className={buttonClass("primary", "w-fit")}>
                    Meta অ্যাকাউন্ট কানেক্ট করো
                  </Link>
                </>
              )}

              {connection && expired && (
                <>
                  <Badge tone="warning">মেয়াদ শেষ</Badge>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    নিরাপত্তার জন্য Meta সংযোগ কিছুদিন পর পর নবায়ন করতে হয়।
                  </p>
                  <Link href="/api/meta/connect" className={buttonClass("primary", "w-fit")}>
                    আবার কানেক্ট করো
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
                        সংযুক্ত{expiresOn && ` · ${expiresOn} পর্যন্ত বৈধ`}
                      </p>
                    </div>
                  </div>
                  <form action={disconnectMeta} className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <button type="submit" className={buttonClass("danger", "-ml-4")}>
                      সংযোগ বিচ্ছিন্ন করো
                    </button>
                    <p className="mt-1 text-xs text-zinc-400">
                      সংরক্ষিত বিজ্ঞাপনের ডাটাও মুছে যাবে।
                    </p>
                  </form>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={UserCircle2} title="তোমার অ্যাকাউন্ট" />
            <p className="px-5 py-4 text-sm text-zinc-600 dark:text-zinc-400">
              লগইন করা আছে: <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.email}</span>
            </p>
          </Card>
        </div>

        <Card>
          <CardHeader
            icon={Wallet}
            title="Ad Account"
            description="ড্যাশবোর্ডে কোন Ad Account-এর হিসাব দেখাবে"
          />
          <div className="px-5 py-5">
            {!connection || expired ? (
              <p className="text-sm text-zinc-500">আগে Meta অ্যাকাউন্ট কানেক্ট করো।</p>
            ) : fetchError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
            ) : adAccounts.length === 0 ? (
              <p className="text-sm text-zinc-500">এই অ্যাকাউন্টে কোনো Ad Account পাওয়া যায়নি।</p>
            ) : (
              <AdAccountPicker
                accounts={adAccounts}
                selectedId={connection.selected_ad_account_id}
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
