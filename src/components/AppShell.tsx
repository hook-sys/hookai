import type { ReactNode } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  LogOut,
  Newspaper,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { Logo, cn } from "@/components/ui";

type Section = "dashboard" | "settings" | "admin" | "admin-blog";

type NavItem = { id: Section; href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
  { id: "settings", href: "/settings", label: "সেটিংস", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { id: "admin", href: "/admin/ai", label: "AI প্রোভাইডার", icon: ShieldCheck },
  { id: "admin-blog", href: "/admin/blog", label: "ব্লগ", icon: Newspaper },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  );
}

function LogoutButton({ withLabel }: { withLabel: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="লগআউট"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <LogOut className="size-4" aria-hidden />
        {withLabel && "লগআউট"}
      </button>
    </form>
  );
}

// সব লগইন-করা পেজের কাঠামো: বড় স্ক্রিনে বাঁয়ে সাইডবার, মোবাইলে উপরে মেনু
export default async function AppShell({
  active,
  children,
}: {
  active: Section;
  children: ReactNode;
}) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    isAdmin,
  ] = await Promise.all([supabase.auth.getUser(), isCurrentUserAdmin(supabase)]);

  // অ্যাডমিন লিংক শুধু অ্যাডমিনকে দেখায়; আসল সুরক্ষা পেজ ও action-এর ভেতরে
  const items = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-5 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-2">
          <Logo />
        </div>
        <nav aria-label="প্রধান মেনু" className="mt-8 flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} />
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p
            className="truncate px-3 pb-2 text-xs text-zinc-500 dark:text-zinc-400"
            title={user?.email}
          >
            {user?.email}
          </p>
          <LogoutButton withLabel />
        </div>
      </aside>

      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <LogoutButton withLabel={false} />
        </div>
        <nav aria-label="প্রধান মেনু" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} />
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
