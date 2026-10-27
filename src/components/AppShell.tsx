import type { ReactNode } from "react";
import Link from "next/link";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Newspaper,
  PackageCheck,
  PenLine,
  Rocket,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Users,
  UsersRound,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { getTr } from "@/lib/i18n-server";
import { Logo, cn } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";
import AccountSwitcher from "@/components/AccountSwitcher";
import ClientSwitcher from "@/components/ClientSwitcher";
import { adAccountOptions } from "@/lib/meta/accountsCache";
import { currentClient } from "@/lib/clients";

type Section = "dashboard" | "manage" | "launch" | "rules" | "audiences" | "orders" | "clients" | "reports" | "ad-copy" | "funnels" | "settings" | "admin" | "admin-blog" | "admin-users";

type NavItem = { id: Section; href: string; label: string; icon: LucideIcon; soon?: string };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "glass-chip text-zinc-950 dark:text-white"
          : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
      {item.soon && (
        <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {item.soon}
        </span>
      )}
    </Link>
  );
}

// উপরের ট্যাব: মূল চারটা পাতা, স্ক্রল করলেও উপরে থাকে
function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "glass-chip text-zinc-950 dark:text-white"
          : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100",
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
  // উপরের Ad Account বদলের মেনু (Meta কানেক্ট থাকলে)
  const [accountMenu, clientInfo] = user
    ? await Promise.all([adAccountOptions(supabase, user.id), currentClient(supabase, user.id)])
    : [null, null];
  const clientList = clientInfo?.clients ?? [];
  const selectedClient = clientInfo?.client ?? null;
  // ক্লায়েন্ট থাকলে শুধু তার Ad Account; কোনো ক্লায়েন্ট না থাকলে সব
  const clientAccountIds = new Set(
    (clientInfo?.accounts ?? []).filter((a) => a.client_id === selectedClient?.id).map((a) => a.ad_account_id),
  );
  const menuAccounts =
    clientList.length > 0
      ? [...clientAccountIds].map(
          (id) =>
            accountMenu?.accounts.find((a) => a.id === id) ?? {
              id,
              name: clientInfo?.accounts.find((a) => a.ad_account_id === id)?.ad_account_name ?? id,
              active: true,
            },
        )
      : (accountMenu?.accounts ?? []);
  const switcher = accountMenu ? (
    <AccountSwitcher accounts={menuAccounts} selectedId={accountMenu.selectedId} selectedName={accountMenu.selectedName} />
  ) : null;
  const clientSwitcher =
    clientList.length > 0 ? (
      <ClientSwitcher
        clients={clientList.map((c) => ({
          id: c.id,
          name: c.name,
          count: (clientInfo?.accounts ?? []).filter((a) => a.client_id === c.id).length,
        }))}
        selectedId={selectedClient?.id ?? null}
      />
    ) : null;

  const nav: NavItem[] = [
    { id: "dashboard", href: "/dashboard", label: tr("Dashboard", "ড্যাশবোর্ড"), icon: LayoutDashboard },
    { id: "manage", href: "/manage", label: tr("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ"), icon: SlidersHorizontal },
    { id: "orders", href: "/orders", label: tr("Orders", "অর্ডার"), icon: PackageCheck },
    { id: "reports", href: "/reports", label: tr("Reports", "রিপোর্ট"), icon: FileText },
    { id: "launch", href: "/launch", label: tr("New ad", "নতুন বিজ্ঞাপন"), icon: Rocket },
    { id: "audiences", href: "/audiences", label: tr("Audiences", "অডিয়েন্স"), icon: UsersRound },
    { id: "rules", href: "/rules", label: tr("Automatic rules", "স্বয়ংক্রিয় নিয়ম"), icon: Zap },
    { id: "ad-copy", href: "/ad-copy", label: tr("Ad copy", "অ্যাডের লেখা"), icon: PenLine },
    { id: "funnels", href: "/funnels", label: tr("Funnels", "ফানেল"), icon: Workflow, soon: tr("Soon", "শীঘ্রই") },
    { id: "settings", href: "/settings", label: tr("Settings", "সেটিংস"), icon: Settings },
  ];
  const adminNav: NavItem[] = [
    { id: "admin-users", href: "/admin/users", label: tr("Users & plans", "ইউজার ও প্ল্যান"), icon: Users },
    { id: "admin", href: "/admin/ai", label: tr("AI provider", "AI প্রোভাইডার"), icon: ShieldCheck },
    { id: "admin-blog", href: "/admin/blog", label: tr("Blog", "ব্লগ"), icon: Newspaper },
  ];

  // মূল চারটা পাতা উপরের ট্যাবে; বাকিগুলো পাশের মেনুতে
  const TAB_IDS: Section[] = ["dashboard", "orders", "manage", "reports"];
  const tabs = TAB_IDS.map((id) => nav.find((n) => n.id === id)!).filter(Boolean);
  // অ্যাডমিন লিংক শুধু অ্যাডমিনকে দেখায়; আসল সুরক্ষা পেজ ও action-এর ভেতরে
  const items = (isAdmin ? [...nav, ...adminNav] : nav).filter((n) => !TAB_IDS.includes(n.id));
  const tabLabel = tr("Main pages", "মূল পাতা");
  const logout = tr("Log out", "লগআউট");
  const menuLabel = tr("Main menu", "প্রধান মেনু");

  return (
    <div className="app-glass-bg min-h-screen lg:flex">
      <aside className="glass-panel sticky top-0 hidden h-screen w-64 shrink-0 flex-col rounded-none border-y-0 border-l-0 px-4 py-5 print:!hidden lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        {clientSwitcher && <div className="mt-5">{clientSwitcher}</div>}
        <nav aria-label={menuLabel} className={clientSwitcher ? "mt-5 flex flex-col gap-1" : "mt-8 flex flex-col gap-1"}>
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} />
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-900/10 pt-4 dark:border-white/10">
          <p
            className="truncate px-3 pb-2 text-xs text-zinc-500 dark:text-zinc-400"
            title={user?.email}
          >
            {user?.email}
          </p>
          <LogoutButton label={logout} withLabel />
        </div>
      </aside>

      <header className="glass-panel sticky top-0 z-20 rounded-none border-x-0 border-t-0 print:hidden lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <LogoutButton label={logout} withLabel={false} />
          </div>
        </div>
        {(clientSwitcher || switcher) && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-2">
            {clientSwitcher}
            {switcher}
          </div>
        )}
        <nav aria-label={tabLabel} className="flex gap-1 overflow-x-auto px-3 pb-2">
          {tabs.map((item) => (
            <TabLink key={item.id} item={item} active={item.id === active} />
          ))}
          {items.map((item) => (
            <NavLink key={item.id} item={item} active={item.id === active} />
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-6 sm:px-6 lg:px-10 lg:pb-8 print:p-0">
        {/* বড় স্ক্রিনে উপরের ট্যাব, Ad Account আর ভাষা; স্ক্রল করলেও উপরে থাকে */}
        <div className="sticky top-0 z-20 -mx-4 hidden px-4 pt-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:block lg:px-10 print:!hidden">
          <div className="glass-panel mx-auto flex max-w-6xl items-center gap-3 rounded-2xl p-1.5">
            <nav aria-label={tabLabel} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {tabs.map((item) => (
                <TabLink key={item.id} item={item} active={item.id === active} />
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-2 pr-1">
              {switcher}
              <LanguageSwitch />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl pt-6 lg:pt-3">{children}</div>
      </main>
    </div>
  );
}
