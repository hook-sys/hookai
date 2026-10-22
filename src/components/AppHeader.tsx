import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";

type Props = { active: "dashboard" | "settings" | "admin" };

const linkClass = (isActive: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${
    isActive
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

export default async function AppHeader({ active }: Props) {
  // সুপার অ্যাডমিন লিংক শুধু অ্যাডমিনকে দেখায়; আসল সুরক্ষা পেজ ও action-এর ভেতরে
  const isAdmin = await isCurrentUserAdmin(await createClient());

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Meta Ads Agent
        </span>
        <nav className="flex gap-1">
          <Link href="/dashboard" className={linkClass(active === "dashboard")}>
            ড্যাশবোর্ড
          </Link>
          <Link href="/settings" className={linkClass(active === "settings")}>
            সেটিংস
          </Link>
          {isAdmin && (
            <Link href="/admin/ai" className={linkClass(active === "admin")}>
              সুপার অ্যাডমিন
            </Link>
          )}
        </nav>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          লগআউট
        </button>
      </form>
    </header>
  );
}
