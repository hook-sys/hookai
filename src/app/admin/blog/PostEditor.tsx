"use client";

import { useActionState, useRef, useState } from "react";
import {
  Bold,
  Eye,
  Heading2,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
  Loader2,
  PenLine,
  Quote,
  Upload,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import { Card, buttonClass, cn, inputClass } from "@/components/ui";
import { slugify, type BlogPost } from "@/lib/blog";
import { savePost, uploadBlogImage, type SaveState } from "./actions";

// datetime-local ইনপুটের জন্য স্থানীয় সময় (ব্রাউজারের টাইমজোনে)
function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostEditor({
  post,
  categories,
}: {
  post: BlogPost | null;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(savePost, null);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  // URL নিজে হাতে বদলালে শিরোনাম বদলালেও আর বদলায় না
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [content, setContent] = useState(post?.content ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState(post?.cover_image_url ?? "");
  const [status, setStatus] = useState<"draft" | "published">(post?.status ?? "draft");
  const [publishAt, setPublishAt] = useState(toLocalInput(post?.published_at ?? null));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState<"cover" | "inline" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // নির্বাচিত লেখার আগে-পরে Markdown চিহ্ন বসায়
  const wrap = (before: string, after = "", placeholder = "") => {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + selected + after + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  // লাইনের শুরুতে চিহ্ন (শিরোনাম, তালিকা, উদ্ধৃতি)
  const prefixLine = (prefix: string) => {
    const el = textRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = content.lastIndexOf("\n", s - 1) + 1;
    setContent(content.slice(0, lineStart) + prefix + content.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  };

  const upload = async (file: File, target: "cover" | "inline") => {
    setUploading(target);
    setUploadError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadBlogImage(fd);
    setUploading(null);
    if ("error" in res) {
      setUploadError(res.error);
      return;
    }
    if (target === "cover") setCover(res.url);
    else wrap(`![`, `](${res.url})`, "ছবির বর্ণনা");
  };

  const tool = (label: string, Icon: typeof Bold, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );

  const scheduled = status === "published" && new Date(publishAt) > new Date();
  const words = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {post && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="cover_image_url" value={cover} />
      <input type="hidden" name="status" value={status} />
      {/* ব্রাউজারের স্থানীয় সময়কে ISO-তে পাঠানো হয়, যাতে সার্ভারে টাইমজোন গুলিয়ে না যায় */}
      <input
        type="hidden"
        name="published_at"
        value={status === "published" && publishAt ? new Date(publishAt).toISOString() : ""}
      />

      <div className="flex min-w-0 flex-col gap-4">
        {state?.error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}

        <input
          name="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="পোস্টের শিরোনাম"
          required
          maxLength={200}
          aria-label="শিরোনাম"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-2xl font-semibold tracking-tight focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
        />

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center">
              {tool("শিরোনাম", Heading2, () => prefixLine("## "))}
              {tool("বোল্ড", Bold, () => wrap("**", "**", "লেখা"))}
              {tool("তালিকা", List, () => prefixLine("- "))}
              {tool("নম্বর তালিকা", ListOrdered, () => prefixLine("1. "))}
              {tool("উদ্ধৃতি", Quote, () => prefixLine("> "))}
              {tool("লিংক", Link2, () => wrap("[", "](https://)", "লিংকের লেখা"))}
              <label
                title="লেখায় ছবি যোগ করো"
                className="cursor-pointer rounded-md p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {uploading === "inline" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="size-4" aria-hidden />
                )}
                <span className="sr-only">লেখায় ছবি যোগ করো</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f, "inline");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
              {(
                [
                  ["write", "লেখা", PenLine],
                  ["preview", "প্রিভিউ", Eye],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm",
                    tab === id
                      ? "bg-white font-medium shadow-sm dark:bg-zinc-900"
                      : "text-zinc-500",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "write" ? (
            <textarea
              ref={textRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"এখানে লেখো। ## দিয়ে উপশিরোনাম, **বোল্ড**, - দিয়ে তালিকা।\n\nউপরের বোতামগুলোও ব্যবহার করতে পারো।"}
              aria-label="পোস্টের লেখা"
              className="min-h-[28rem] w-full resize-y bg-transparent px-5 py-4 font-mono text-sm leading-relaxed focus:outline-none"
            />
          ) : (
            <div className="min-h-[28rem] px-6 py-5">
              {content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-zinc-400">এখনো কিছু লেখা হয়নি।</p>}
            </div>
          )}
          <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
            {words} শব্দ · প্রায় {Math.max(1, Math.round(words / 200))} মিনিটে পড়া যায়
          </p>
        </Card>
        {uploadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">প্রকাশ</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {(
              [
                ["draft", "খসড়া"],
                ["published", "প্রকাশ করো"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatus(id)}
                aria-pressed={status === id}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm",
                  status === id ? "bg-white font-medium shadow-sm dark:bg-zinc-900" : "text-zinc-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {status === "published" && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">প্রকাশের সময়</span>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className={inputClass}
              />
              <span className="text-xs text-zinc-400">
                {scheduled ? "এই সময়ে নিজে থেকে প্রকাশ হবে।" : "এখনই প্রকাশ হবে। ভবিষ্যতের সময় দিলে শিডিউল হবে।"}
              </span>
            </label>
          )}
          <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {status === "draft" ? "খসড়া সংরক্ষণ করো" : scheduled ? "শিডিউল করো" : "প্রকাশ করো"}
          </button>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">কভার ছবি</p>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="কভার" className="aspect-[1.91/1] w-full rounded-lg object-cover" />
          ) : (
            <div className="flex aspect-[1.91/1] items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-700">
              Facebook-এ শেয়ার করলে এই ছবি দেখাবে (1200×630)
            </div>
          )}
          <div className="flex gap-2">
            <label className={buttonClass("secondary", "flex-1 cursor-pointer")}>
              {uploading === "cover" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              আপলোড
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f, "cover");
                  e.target.value = "";
                }}
              />
            </label>
            {cover && (
              <button type="button" onClick={() => setCover("")} className={buttonClass("danger")}>
                সরাও
              </button>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">URL</span>
            <span className="flex items-center rounded-lg border border-zinc-300 bg-white text-sm shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900">
              <span className="pl-3 text-zinc-400">/blog/</span>
              <input
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
                className="min-w-0 flex-1 bg-transparent py-2 pr-3 focus:outline-none"
                maxLength={80}
              />
            </span>
            <span className="text-xs text-zinc-400">ইংরেজি ছোট হাতের অক্ষর ও হাইফেন। Google-এ এটি দেখায়।</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">ক্যাটাগরি</span>
            <input
              name="category"
              defaultValue={post?.category ?? ""}
              list="blog-categories"
              placeholder="যেমন Pixel, Budget, Creative"
              maxLength={60}
              className={inputClass}
            />
            <datalist id="blog-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">সারাংশ</span>
            <textarea
              name="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="তালিকায় ও Google-এ দেখানো ছোট বর্ণনা"
              className={inputClass}
            />
            <span className="text-right text-xs text-zinc-400">{excerpt.length}/400</span>
          </label>
        </Card>
      </aside>
    </form>
  );
}
