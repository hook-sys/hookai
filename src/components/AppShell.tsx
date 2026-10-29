import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  FileText,
  LayoutDashboard,
  LogOut,
  Newspaper,
  PackageCheck,
  PenLine,
  Plus,
  Radio,
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
import { LogoMark, cn } from "@/components/ui";
import LiquidBackdrop from "@/components/LiquidBackdrop";
import LensFlag from "@/components/LensFlag";
import LanguageSwitch from "@/components/LanguageSwitch";
import AccountSwitcher from "@/components/AccountSwitcher";
import ClientSwitcher from "@/components/ClientSwitcher";
import { adAccountOptions } from "@/lib/meta/accountsCache";
import { currentClient } from "@/lib/clients";

type Section = "dashboard" | "assistant" | "manage" | "launch" | "rules" | "audiences" | "assets" | "orders" | "clients" | "reports" | "ad-copy" | "funnels" | "settings" | "admin" | "admin-blog" | "admin-users";

type NavItem = { id: Section; href: string; label: string; icon: LucideIcon; soon?: string };

// পাশের ভাসমান আইকন বার: শুধু আইকন, মাউস রাখলে নাম দেখায়
function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex size-10 items-center justify-center rounded-full transition-colors",
        active ? "glass-chip text-white" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="lg-tip glass-popover pointer-events-none absolute left-full ml-3 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap text-zinc-100">
        {item.label}
        {item.soon && <span className="ml-1.5 text-amber-300">· {item.soon}</span>}
      </span>
    </Link>
  );
}

// উপরের গোল পিল মেনুর ট্যাব
function TabLink({ item, active, withIcon = false }: { item: NavItem; active: boolean; withIcon?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "glass-chip text-white" : "text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100",
      )}
    >
      {withIcon && <Icon className="size-4" aria-hidden />}
      {item.label}
      {item.soon && <span className="text-[10px] text-amber-300">{item.soon}</span>}
    </Link>
  );
}

function LogoutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="flex size-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      >
        <LogOut className="size-4" aria-hidden />
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
    { id: "assistant", href: "/assistant", label: tr("AI assistant", "AI সহকারী"), icon: Bot },
    { id: "manage", href: "/manage", label: tr("Ads control", "বিজ্ঞাপন নিয়ন্ত্রণ"), icon: SlidersHorizontal },
    { id: "orders", href: "/orders", label: tr("Orders", "অর্ডার"), icon: PackageCheck },
    { id: "reports", href: "/reports", label: tr("Reports", "রিপোর্ট"), icon: FileText },
    { id: "launch", href: "/launch", label: tr("New ad", "নতুন বিজ্ঞাপন"), icon: Rocket },
    { id: "assets", href: "/assets", label: tr("Pixel & assets", "Pixel ও অ্যাসেট"), icon: Radio },
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

  // মূল পাতাগুলো উপরের পিলে; বাকিগুলো পাশের আইকন বারে
  const TAB_IDS: Section[] = ["dashboard", "assistant", "manage", "orders", "reports"];
  const tabs = TAB_IDS.map((id) => nav.find((n) => n.id === id)!).filter(Boolean);
  // অ্যাডমিন লিংক শুধু অ্যাডমিনকে দেখায়; আসল সুরক্ষা পেজ ও action-এর ভেতরে
  const rail = nav.filter((n) => !TAB_IDS.includes(n.id) && n.id !== "launch");
  const launch = nav.find((n) => n.id === "launch")!;
  const tabLabel = tr("Main pages", "মূল পাতা");
  const logout = tr("Log out", "লগআউট");
  const menuLabel = tr("More pages", "আরও পাতা");
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="dark app-dark relative min-h-screen print:bg-white">
      <LiquidBackdrop />
      <LensFlag />

      {/* বড় স্ক্রিনে বাঁ পাশে ভাসমান আইকন বার */}
      <nav
        aria-label={menuLabel}
        className="glass-panel fixed top-1/2 left-4 z-30 hidden max-h-[calc(100vh-7rem)] -translate-y-1/2 flex-col items-center gap-1 overflow-visible rounded-full p-1.5 print:!hidden lg:flex"
      >
        <Link
          href={launch.href}
          aria-label={launch.label}
          aria-current={active === "launch" ? "page" : undefined}
          className="group relative mb-1 flex size-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_8px_20px_-6px_rgb(74_111_202/0.8)] hover:bg-indigo-400"
        >
          <Plus className="size-5" aria-hidden />
          <span className="lg-tip glass-popover pointer-events-none absolute left-full ml-3 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap text-zinc-100">
            {launch.label}
          </span>
        </Link>
        {rail.map((item) => (
          <RailLink key={item.id} item={item} active={item.id === active} />
        ))}
        {isAdmin && <span className="my-1 h-px w-6 bg-white/10" aria-hidden />}
        {isAdmin && adminNav.map((item) => <RailLink key={item.id} item={item} active={item.id === active} />)}
      </nav>

      <div className="relative z-10 lg:pl-20">
        {/* উপরের বার: লোগো, পিল মেনু, ক্লায়েন্ট/অ্যাকাউন্ট, ভাষা */}
        {/* নিচের লেখা স্ক্রল করে পিলের ফাঁক দিয়ে না দেখায়, তাই পেছনে গাঢ় থেকে স্বচ্ছ আভা */}
        <header className="sticky top-0 z-20 bg-gradient-to-b from-[#17181b] from-55% to-transparent px-3 pt-3 pb-5 print:hidden sm:px-4 lg:pr-6">
          <div className="flex items-center gap-2 lg:gap-3">
            <Link href="/dashboard" className="glass-panel lg-lens flex shrink-0 items-center rounded-full py-1 pr-3 pl-1" aria-label="Hook AI">
              <LogoMark className="size-8 rounded-full" />
              <span className="ml-2 hidden text-sm font-semibold tracking-wide sm:inline">
                HOOK <span className="text-[#FF7A4D]">AI</span>
              </span>
            </Link>
            <nav aria-label={tabLabel} className="glass-panel lg-lens mx-auto hidden min-w-0 gap-0.5 overflow-x-auto rounded-full p-1 lg:flex">
              {tabs.map((item) => (
                <TabLink key={item.id} item={item} active={item.id === active} />
              ))}
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
              {clientSwitcher && <div className="hidden w-48 xl:block">{clientSwitcher}</div>}
              {switcher && <div className="hidden xl:block">{switcher}</div>}
              <div className="glass-panel lg-lens flex items-center gap-1 rounded-full p-1">
                <LanguageSwitch />
                <LogoutButton label={logout} />
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-400 text-xs font-semibold text-black"
                  title={user?.email}
                  aria-label={user?.email}
                >
                  {initial}
                </span>
              </div>
            </div>
          </div>

          {/* ছোট আর মাঝারি স্ক্রিন: ক্লায়েন্ট আর অ্যাকাউন্ট নিচের সারিতে */}
          {(clientSwitcher || switcher) && (
            <div className="mt-2 grid grid-cols-2 gap-2 xl:hidden">
              {clientSwitcher ?? <span />}
              <div className="flex justify-end">{switcher}</div>
            </div>
          )}
          {/* মোবাইল: সব পাতা পাশাপাশি স্ক্রল করা যায় এমন পিলে */}
          <nav aria-label={tabLabel} className="glass-panel mt-2 flex gap-0.5 overflow-x-auto rounded-full p-1 lg:hidden">
            {[...tabs, launch, ...rail, ...(isAdmin ? adminNav : [])].map((item) => (
              <TabLink key={item.id} item={item} active={item.id === active} withIcon />
            ))}
          </nav>
        </header>

        <main className="min-w-0 px-4 pb-10 sm:px-6 lg:pr-8 lg:pl-6 print:p-0">
          <div key={active} className="lg-page mx-auto max-w-6xl pt-4 lg:pt-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
