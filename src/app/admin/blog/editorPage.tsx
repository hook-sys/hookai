import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { getPostById, postState } from "@/lib/blog";
import AppShell from "@/components/AppShell";
import { getTr } from "@/lib/i18n-server";
import { Notice, PageHeader, buttonClass } from "@/components/ui";
import { deletePost } from "./actions";
import PostEditor from "./PostEditor";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// নতুন ও পুরনো পোস্ট দুটোই এই পেজ দিয়ে
export async function renderEditor(id: string | null, saved: boolean) {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();

  let post = null;
  if (id) {
    if (!UUID_PATTERN.test(id)) notFound();
    post = await getPostById(supabase, id);
    if (!post) notFound();
  }

  const { data: cats } = await supabase.from("blog_posts").select("category").not("category", "is", null);
  const categories = [...new Set((cats ?? []).map((c) => c.category as string))].sort();
  const state = post ? postState(post) : null;

  return (
    <AppShell active="admin-blog">
      <Link
        href="/admin/blog"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {tr("All posts", "সব পোস্ট")}
      </Link>
      <PageHeader
        title={post ? tr("Edit post", "পোস্ট সম্পাদনা") : tr("New post", "নতুন পোস্ট")}
        actions={
          post &&
          state === "published" && (
            <Link href={`/blog/${post.slug}`} target="_blank" className={buttonClass("secondary")}>
              <ExternalLink className="size-4" aria-hidden />
              {tr("View live post", "প্রকাশিত পোস্ট দেখো")}
            </Link>
          )
        }
      />

      {saved && (
        <Notice tone="success">
          {state === "published"
            ? tr("Published.", "প্রকাশিত হয়েছে।")
            : state === "scheduled"
              ? tr("Scheduled. It will go live at the set time.", "শিডিউল হয়েছে, নির্ধারিত সময়ে প্রকাশ হবে।")
              : tr("Draft saved.", "খসড়া সংরক্ষণ হয়েছে।")}
        </Notice>
      )}

      <PostEditor key={post?.updated_at ?? "new"} post={post} categories={categories} />

      {post && (
        <form action={deletePost} className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <input type="hidden" name="id" value={post.id} />
          <button type="submit" className={buttonClass("danger", "-ml-4")}>
            <Trash2 className="size-4" aria-hidden />
            {tr("Delete this post", "এই পোস্ট মুছে ফেলো")}
          </button>
          <p className="mt-1 text-xs text-zinc-400">{tr("This can't be undone. To just hide it, switch it back to draft.", "মুছলে আর ফেরত আনা যাবে না। শুধু লুকাতে চাইলে খসড়া করে দাও।")}</p>
        </form>
      )}
    </AppShell>
  );
}
