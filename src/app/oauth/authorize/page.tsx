import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, Card } from "@/components/ui";
import { parseAuthorize } from "./params";
import { decide } from "./actions";

export const metadata: Metadata = { title: "Connect to Claude", robots: { index: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

// Claude (কাস্টম কানেক্টর) Hook-এর মাধ্যমে বিজ্ঞাপন চালানোর অনুমতি চাইলে এই পাতা খোলে
export default async function AuthorizePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const req = parseAuthorize(get);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">{children}</Card>
    </main>
  );

  if (typeof req === "string") {
    return shell(
      <>
        <h1 className="text-xl font-semibold">Can&apos;t connect</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{req}</p>
      </>,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])}`;
    redirect(`/api/oauth/login-return?next=${encodeURIComponent(here)}`);
  }

  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) {
    return shell(
      <>
        <h1 className="text-xl font-semibold">Not available for this account</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">The Claude connector is only open to the Hook owner for now.</p>
      </>,
    );
  }

  const host = new URL(req.redirectUri).host;
  return shell(
    <>
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-8 text-indigo-600" aria-hidden />
        <h1 className="text-xl font-semibold">Let {host} use Hook?</h1>
      </div>
      <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
        Signed in as <strong>{user.email}</strong>. Claude will be able to, for your clients&apos; ad accounts:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Read reports, campaigns and audiences</li>
        <li>Upload images and videos, and create campaigns, ad sets, ads and audiences (always paused)</li>
        <li>Pause ads at once; turn ads on or raise budgets only after showing you a preview</li>
      </ul>
      <p className="mt-3 text-xs text-zinc-500">Every change is logged. Access lasts 30 days unless used again.</p>
      <form action={decide} className="mt-6 flex gap-3">
        <input type="hidden" name="response_type" value="code" />
        <input type="hidden" name="client_id" value={req.clientId} />
        <input type="hidden" name="redirect_uri" value={req.redirectUri} />
        <input type="hidden" name="code_challenge" value={req.challenge} />
        <input type="hidden" name="code_challenge_method" value="S256" />
        <input type="hidden" name="state" value={req.state} />
        <button type="submit" name="decision" value="allow" className={buttonClass("primary")}>
          Allow
        </button>
        <button type="submit" name="decision" value="deny" className={buttonClass("secondary")}>
          Deny
        </button>
      </form>
    </>,
  );
}
