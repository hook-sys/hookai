import { redirect } from "next/navigation";
import { Building2, Lock, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { currentClient } from "@/lib/clients";
import { loadClientProfile } from "@/lib/clientProfile";
import { pagePostsAllowed } from "@/lib/pagePostsAccess";
import { listUserPages } from "@/lib/meta/pagePublish";
import AppShell from "@/components/AppShell";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import PagePostForm from "./PagePostForm";
import PagePostsList from "./PagePostsList";
import type { PagePostItem } from "./actions";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("Page posts", "পেজ পোস্ট") };
}

// রেগুলার Page পোস্ট: খসড়া তৈরি → মালিকের approve → এখনই বা শিডিউলে প্রকাশ (আপাতত নির্দিষ্ট অ্যাকাউন্টে)
export default async function PagePostsPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!pagePostsAllowed(user.email)) {
    return (
      <AppShell active="page-posts">
        <PageHeader title={tr("Page posts", "পেজ পোস্ট")} />
        <EmptyState
          icon={Lock}
          title={tr("Not available yet", "এখনো চালু হয়নি")}
          text={tr("Page posts is being tested on a few accounts first.", "পেজ পোস্ট আপাতত কয়েকটা অ্যাকাউন্টে পরীক্ষা চলছে।")}
        />
      </AppShell>
    );
  }

  const { data: connection } = await supabase
    .from("meta_connections")
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection?.access_token_encrypted) {
    return (
      <AppShell active="page-posts">
        <PageHeader title={tr("Page posts", "পেজ পোস্ট")} />
        <EmptyState
          icon={Building2}
          title={tr("Connect Facebook first", "আগে Facebook কানেক্ট করো")}
          text={tr("Connect your Facebook account in Settings, then come back to post on your pages.", "সেটিংস থেকে Facebook অ্যাকাউন্ট কানেক্ট করে এসে পেজে পোস্ট করো।")}
        />
      </AppShell>
    );
  }
  const token = decrypt(connection.access_token_encrypted);

  const [{ client }, pages, { data: posts }] = await Promise.all([
    currentClient(supabase, user.id),
    listUserPages(token).catch(() => [] as { id: string; name: string }[]),
    supabase
      .from("page_posts")
      .select("id, page_id, page_name, kind, caption, media, status, scheduled_at, approved_at, fb_post_id, permalink, error, created_at, published_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const profile = client ? await loadClientProfile(supabase, user.id, client.id) : null;
  const rows = (posts ?? []) as PagePostItem[];

  return (
    <AppShell active="page-posts">
      <PageHeader
        title={tr("Page posts", "পেজ পোস্ট")}
        description={tr(
          "Regular posts on your Facebook page — text, a photo or a video. Everything starts as a draft and publishes only after you approve it.",
          "তোমার Facebook পেজে রেগুলার পোস্ট — লেখা, ছবি বা ভিডিও। সবকিছু খসড়া হিসেবে শুরু হয়; তুমি approve করলেই শুধু প্রকাশ হয়।",
        )}
      />
      <Card>
        <CardHeader
          icon={Send}
          title={tr("New post", "নতুন পোস্ট")}
          description={tr("Saved as a draft first — approve it below to publish.", "আগে খসড়া হিসেবে থাকবে — প্রকাশ করতে নিচে approve করো।")}
        />
        <div className="px-5 py-5">
          <PagePostForm userId={user.id} pages={pages} defaultPageId={profile?.profile.page_id} />
        </div>
      </Card>

      {rows.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">{tr("Your posts", "তোমার পোস্ট")}</h2>
          <PagePostsList posts={rows} />
        </section>
      )}
    </AppShell>
  );
}
