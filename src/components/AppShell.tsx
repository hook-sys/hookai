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
import { getTr } from "@/lib/i18n-server";
import { Logo, cn } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";

type Section = "dashboard" | "settings" | "admin" | "admin-blog";

type NavItem = { id: Section; href: string; label: string; icon: LucideIcon };

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

function LogoutButton({ label, withLabel }: { label: string; withLabel: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label={label}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <LogOut className="size-4" aria-hidden />
        {withLabel && label}
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
  const tr = await getTr();
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    isAdmin,
  ] = await Promise.all([supabase.auth.getUser(), isCurrentUserAdmin(supabase)]);

  const nav: NavItem[] = [
    { id: "dashboard", href: "/dashboard", label: tr("Dashboard", "ড্যাশবোর্ড"), icon: LayoutDashboard },
    { id: "settings", href: "/settings", label: tr("Settings", "সেটিংস"), icon: Settings },
  ];
  const adminNav: NavItem[] = [
    { id: "admin", href: "/admin/ai", label: tr("AI provider", "AI প্রোভাইডার"), icon: ShieldCheck },
    { id: "admin-blog", href: "/admin/blog", label: tr("Blog", "ব্লগ"), icon: Newspaper },
  ];

  // অ্যাডমিন লিংক শুধু অ্যাডমিনকে দেখায়; আসল সুরক্ষা পেজ ও action-এর ভেতরে
  const items = isAdmin ? [...nav, ...adminNav] : nav;
  const logout = tr("Log out", "লগআউট");
  const menuLabel = tr("Main menu", "প্রধান মেনু");

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-5 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-2">
          <Logo />
        </div>
        <nav aria-label={menuLabel} className="mt-8 flex flex-col gap-1">
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
          <LogoutButton label={logout} withLabel />
        </div>
      </aside>

      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <LogoutButton label={logout} withLabel={false} />
          </div>
        </div>
        <nav aria-label={menuLabel} className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} />
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {/* বড় স্ক্রিনে ভাষা বদলের বোতাম উপরের ডান কোণে */}
        <div className="mx-auto mb-2 hidden max-w-6xl justify-end lg:flex">
          <LanguageSwitch />
        </div>
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
