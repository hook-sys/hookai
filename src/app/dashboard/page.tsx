import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { decrypt } from "@/lib/crypto";
import { getAdAccounts, type AdAccount } from "@/lib/meta/graph";
import { disconnectMeta, selectAdAccount } from "./actions";

const MESSAGES: Record<string, string> = {
  connected: "Meta অ্যাকাউন্ট সফলভাবে কানেক্ট হয়েছে।",
  denied: "Meta অনুমতি বাতিল করা হয়েছে।",
  invalid: "সংযোগ যাচাই করা যায়নি। আবার চেষ্টা করো।",
  error: "Meta সংযোগে সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।",
};

type Props = { searchParams: Promise<{ meta?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
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

  return (
    <main className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          ড্যাশবোর্ড
        </h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            লগআউট
          </button>
        </form>
      </header>

      {meta && MESSAGES[meta] && (
        <p className="mb-6 rounded-lg bg-white p-3 text-sm text-zinc-700 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
          {MESSAGES[meta]}
        </p>
      )}

      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        স্বাগতম, {user.email}
      </p>

      <section className="max-w-xl rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Meta অ্যাকাউন্ট
        </h2>

        {!connection && (
          <Link
            href="/api/meta/connect"
            className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Meta অ্যাকাউন্ট কানেক্ট করো
          </Link>
        )}

        {connection && expired && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-600">
              Meta সংযোগের মেয়াদ শেষ হয়ে গেছে। আবার কানেক্ট করো।
            </p>
            <Link
              href="/api/meta/connect"
              className="inline-block w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              আবার কানেক্ট করো
            </Link>
          </div>
        )}

        {connection && !expired && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-emerald-600">
              সংযুক্ত: {connection.meta_user_name}
            </p>

            {fetchError && (
              <p className="text-sm text-red-600">{fetchError}</p>
            )}

            {!fetchError && adAccounts.length === 0 && (
              <p className="text-sm text-zinc-500">
                এই অ্যাকাউন্টে কোনো Ad Account পাওয়া যায়নি।
              </p>
            )}

            {adAccounts.length > 0 && (
              <form action={selectAdAccount} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  কোন Ad Account নিয়ে কাজ করবে?
                </p>
                {adAccounts.map((acc) => (
                  <label
                    key={acc.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700"
                  >
                    <input
                      type="radio"
                      name="accountId"
                      value={acc.id}
                      defaultChecked={acc.id === connection.selected_ad_account_id}
                    />
                    <span className="flex-1">
                      {acc.name} <span className="text-zinc-500">({acc.id})</span>
                    </span>
                    <span className="text-zinc-500">{acc.currency}</span>
                  </label>
                ))}
                <button
                  type="submit"
                  className="mt-2 w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  সংরক্ষণ করো
                </button>
              </form>
            )}

            <form action={disconnectMeta}>
              <button
                type="submit"
                className="text-sm text-red-600 underline"
              >
                সংযোগ বিচ্ছিন্ন করো
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
