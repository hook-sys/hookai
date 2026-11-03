"use client";

import { useActionState } from "react";
import { Check, ExternalLink, ImageIcon, Loader2, RotateCcw, Send, Trash2, Type, Video } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { Badge, Card, buttonClass } from "@/components/ui";
import {
  approvePagePost,
  deletePagePost,
  publishPagePostNow,
  retryPagePost,
  type PagePostItem,
  type PagePostState,
} from "./actions";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }) : null;

function RowActions({ post }: { post: PagePostItem }) {
  const tr = useTr();
  const [approveState, approveAction, approvePending] = useActionState<PagePostState, FormData>(approvePagePost, null);
  const [publishState, publishAction, publishPending] = useActionState<PagePostState, FormData>(publishPagePostNow, null);
  const [retryState, retryAction, retryPending] = useActionState<PagePostState, FormData>(retryPagePost, null);
  const [deleteState, deleteAction, deletePending] = useActionState<PagePostState, FormData>(deletePagePost, null);

  const states = [approveState, publishState, retryState, deleteState];
  const message = states.find((s): s is { ok: true; message: string } => Boolean(s?.ok))?.message;
  const error = states.find((s): s is { ok: false; error: string } => Boolean(s && !s.ok))?.error;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {post.status === "draft" && (
          <form action={approveAction}>
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={approvePending} className={buttonClass("primary")}>
              {approvePending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {tr("Approve", "Approve করো")}
            </button>
          </form>
        )}
        {(post.status === "approved" || post.status === "scheduled") && (
          <form
            action={publishAction}
            onSubmit={(e) => {
              if (!window.confirm(tr("Publish this post on the page now?", "পোস্টটা এখনই পেজে প্রকাশ করবে?"))) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={publishPending} className={buttonClass("primary")}>
              {publishPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {tr("Publish now", "এখনই প্রকাশ করো")}
            </button>
          </form>
        )}
        {post.status === "failed" && post.approved_at && (
          <form
            action={retryAction}
            onSubmit={(e) => {
              if (!window.confirm(tr("Publish this post on the page now?", "পোস্টটা এখনই পেজে প্রকাশ করবে?"))) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={retryPending} className={buttonClass("secondary")}>
              {retryPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              {tr("Retry publish", "আবার প্রকাশ করো")}
            </button>
          </form>
        )}
        {(post.status === "draft" || post.status === "failed") && (
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!window.confirm(tr("Delete this post?", "পোস্টটা মুছে ফেলবে?"))) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={post.id} />
            <button type="submit" disabled={deletePending} className={buttonClass("danger")}>
              {deletePending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              {tr("Delete", "মোছো")}
            </button>
          </form>
        )}
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className={buttonClass("ghost")}>
            <ExternalLink className="size-4" aria-hidden />
            {tr("View on Facebook", "Facebook-এ দেখো")}
          </a>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PagePostsList({ posts }: { posts: PagePostItem[] }) {
  const tr = useTr();
  const statusLabel = (p: PagePostItem) => {
    switch (p.status) {
      case "draft":
        return { text: tr("Draft — waiting for approval", "খসড়া — অনুমোদনের অপেক্ষায়"), tone: "neutral" as const };
      case "approved":
        return { text: tr("Approved", "অনুমোদিত"), tone: "brand" as const };
      case "scheduled":
        return { text: tr("Scheduled", "শিডিউল করা"), tone: "warning" as const };
      case "publishing":
        return { text: tr("Publishing…", "প্রকাশ হচ্ছে…"), tone: "warning" as const };
      case "published":
        return { text: tr("Published", "প্রকাশিত"), tone: "success" as const };
      case "failed":
        return { text: tr("Failed", "ব্যর্থ"), tone: "danger" as const };
    }
  };
  const KindIcon = ({ kind }: { kind: PagePostItem["kind"] }) =>
    kind === "video" ? (
      <Video className="size-4 text-zinc-400" aria-hidden />
    ) : kind === "photo" ? (
      <ImageIcon className="size-4 text-zinc-400" aria-hidden />
    ) : (
      <Type className="size-4 text-zinc-400" aria-hidden />
    );

  return (
    <div className="flex flex-col gap-3">
      {posts.map((p) => {
        const s = statusLabel(p);
        const overdue = p.status === "draft" && p.scheduled_at && new Date(p.scheduled_at).getTime() <= Date.now();
        return (
          <Card key={p.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <KindIcon kind={p.kind} />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.page_name ?? p.page_id}</span>
              <Badge tone={s.tone}>{s.text}</Badge>
              {p.media[0] && <span className="truncate text-xs text-zinc-400">{p.media[0].name}</span>}
            </div>
            {p.caption && <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{p.caption}</p>}
            <p className="mt-2 text-xs text-zinc-400">
              {tr("Created", "তৈরি")}: {fmt(p.created_at)}
              {p.scheduled_at && (
                <>
                  {" · "}
                  {tr("Scheduled", "শিডিউল")}: {fmt(p.scheduled_at)}
                </>
              )}
              {p.published_at && (
                <>
                  {" · "}
                  {tr("Published", "প্রকাশিত")}: {fmt(p.published_at)}
                </>
              )}
            </p>
            {overdue && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {tr("The scheduled time has passed — it will publish after approval.", "শিডিউলের সময় পেরিয়ে গেছে — approve করলেই প্রকাশ হবে।")}
              </p>
            )}
            {p.status === "failed" && p.error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{p.error}</p>
            )}
            <RowActions post={p} />
          </Card>
        );
      })}
    </div>
  );
}
