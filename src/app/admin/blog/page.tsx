import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, PenLine, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { formatPostDate, listAllPosts, postState } from "@/lib/blog";
import AppShell from "@/components/AppShell";
import { getTr } from "@/lib/i18n-server";
import { Badge, Card, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Blog" };

type Props = { searchParams: Promise<{ deleted?: string }> };

export default async function AdminBlogPage({ searchParams }: Props) {
  const tr = await getTr();
  const STATE_BADGE = {
    draft: { label: tr("Draft", "খসড়া"), tone: "neutral" },
    scheduled: { label: tr("Scheduled", "শিডিউল"), tone: "warning" },
    published: { label: tr("Published", "প্রকাশিত"), tone: "success" },
  } as const;
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();

  const posts = await listAllPosts(supabase);
  const counts = posts.reduce(
    (acc, p) => ({ ...acc, [postState(p)]: acc[postState(p)] + 1 }),
    { draft: 0, scheduled: 0, published: 0 },
  );

  const newButton = (
    <Link href="/admin/blog/new" className={buttonClass("primary")}>
      <Plus className="size-4" aria-hidden />
      {tr("New post", "নতুন পোস্ট")}
    </Link>
  );

  return (
    <AppShell active="admin-blog">
      <PageHeader
        title={tr("Blog", "ব্লগ")}
        description={tr(
          `${counts.published} published · ${counts.scheduled} scheduled · ${counts.draft} drafts`,
          `${counts.published}টি প্রকাশিত · ${counts.scheduled}টি শিডিউল · ${counts.draft}টি খসড়া`,
        )}
        actions={
          <>
            <Link href="/blog" target="_blank" className={buttonClass("secondary")}>
              <ExternalLink className="size-4" aria-hidden />
              {tr("View blog", "ব্লগ দেখো")}
            </Link>
            {newButton}
          </>
        }
      />

      {deleted && <Notice tone="info">{tr("Post deleted.", "পোস্ট মুছে ফেলা হয়েছে।")}</Notice>}

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tr("No posts yet", "এখনো কোনো পোস্ট নেই")}
          text={tr(
            "Write your first post. Keep it as a draft, publish now, or schedule it for later.",
            "প্রথম পোস্ট লেখো। খসড়া রেখে পরে প্রকাশ করতে পারো, অথবা নির্দিষ্ট সময়ে প্রকাশের জন্য শিডিউল করতে পারো।",
          )}
          action={newButton}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {posts.map((p) => {
              const state = STATE_BADGE[postState(p)];
              return (
                <li key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_image_url} alt="" className="hidden h-12 w-20 shrink-0 rounded-md object-cover sm:block" />
                  ) : (
                    <span className="hidden h-12 w-20 shrink-0 rounded-md bg-zinc-100 sm:block dark:bg-zinc-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/blog/${p.id}`}
                      className="block truncate font-medium text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
                    >
                      {p.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      {p.category && <span>{p.category}</span>}
                      <span>
                        {p.status === "published"
                          ? formatPostDate(p.published_at)
                          : tr(`Edited ${formatPostDate(p.updated_at)}`, `সম্পাদনা ${formatPostDate(p.updated_at)}`)}
                      </span>
                    </p>
                  </div>
                  <Link href={`/admin/blog/${p.id}`} className={buttonClass("ghost", "px-2")} aria-label={tr(`Edit ${p.title}`, `${p.title} সম্পাদনা`)}>
                    <PenLine className="size-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
