"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2, MessageCircle, ShoppingBag, Sparkles, Video, X } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { createDraft, type LaunchState } from "./actions";

const MAX_FILES = 5;
const MAX_IMAGE = 30 * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;

export default function NewLaunchForm({
  userId,
  pages,
  pixels,
  currency,
  defaultBudget,
}: {
  userId: string;
  pages: { id: string; name: string }[];
  pixels: { id: string; name: string; active: boolean }[];
  currency: string | null;
  defaultBudget: number;
}) {
  const tr = useTr();
  const [state, action] = useActionState<LaunchState, FormData>(createDraft, null);
  const [pending, startTransition] = useTransition();
  const [objective, setObjective] = useState<"sales" | "messages">("sales");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setLocalError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      const video = f.type.startsWith("video/");
      if (!video && !f.type.startsWith("image/")) continue;
      if (f.size > (video ? MAX_VIDEO : MAX_IMAGE)) {
        setLocalError(tr(`${f.name} is too large.`, `${f.name} অনেক বড়।`));
        continue;
      }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    if (files.length === 0) return setLocalError(tr("Add at least one image or video.", "অন্তত একটা ছবি বা ভিডিও দাও।"));
    const data = new FormData(e.currentTarget);
    const page = pages.find((p) => p.id === data.get("page_id"));
    data.set("page_name", page?.name ?? "");

    // ছবি/ভিডিও সরাসরি ব্রাউজার থেকে নিজের ফোল্ডারে যায় (বড় ভিডিওও সার্ভার ঘুরে যায় না)
    const supabase = createClient();
    const stamp = Date.now();
    const media: { path: string; kind: "image" | "video"; name: string }[] = [];
    for (const [i, f] of files.entries()) {
      setProgress(tr(`Uploading ${i + 1} of ${files.length}…`, `${files.length}টির ${i + 1} নম্বর আপলোড হচ্ছে…`));
      const ext = (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${userId}/${stamp}-${i}.${ext}`;
      const { error } = await supabase.storage.from("ad-media").upload(path, f, { contentType: f.type, upsert: false });
      if (error) {
        setProgress(null);
        return setLocalError(tr(`Upload failed: ${error.message}`, `আপলোড হয়নি: ${error.message}`));
      }
      media.push({ path, kind: f.type.startsWith("video/") ? "video" : "image", name: f.name });
    }
    data.set("media", JSON.stringify(media));
    setProgress(tr("Planning with AI…", "AI পরিকল্পনা করছে…"));
    startTransition(async () => {
      await action(data);
      setProgress(null);
    });
  };

  const busy = pending || progress !== null;

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium text-zinc-700 dark:text-zinc-300">{tr("Goal", "লক্ষ্য")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["sales", ShoppingBag, tr("Website sales", "ওয়েবসাইটে বিক্রি"), tr("Optimised for purchases (pixel)", "কেনাকাটার জন্য (Pixel)")],
              ["messages", MessageCircle, tr("Messenger messages", "Messenger মেসেজ"), tr("People message your page", "মানুষ পেজে মেসেজ দেবে")],
            ] as const
          ).map(([value, Icon, label, hint]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5",
                objective === value ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/50" : "border-zinc-900/10 dark:border-white/10",
              )}
            >
              <input type="radio" name="objective" value={value} checked={objective === value} onChange={() => setObjective(value)} className="sr-only" />
              <Icon className="mt-0.5 size-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-zinc-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Facebook page", "Facebook পেজ")}</span>
          <select name="page_id" required className={inputClass} defaultValue={pages[0]?.id}>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {objective === "sales" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pixel</span>
            <select name="pixel_id" required className={inputClass} defaultValue={pixels.find((p) => p.active)?.id ?? pixels[0]?.id}>
              {pixels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? ` (${tr("no activity", "কাজ করছে না")})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {objective === "sales" && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Website link (product page)", "ওয়েবসাইট লিংক (প্রোডাক্ট পেজ)")}</span>
          <input name="link" type="url" required placeholder="https://" className={inputClass} />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("What do you want?", "কী চাও লেখো")}</span>
        <textarea
          name="brief"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className={inputClass}
          placeholder={tr(
            "e.g. Leather wallet, price 1,250 tk, free delivery in Dhaka. Men 22-45 in Dhaka and Chattogram, interested in leather and fashion. 1,500 tk a day. If cost per purchase goes over 300 tk, turn it off.",
            "যেমন: চামড়ার ওয়ালেট, দাম ১২৫০ টাকা, ঢাকায় ফ্রি ডেলিভারি। ঢাকা আর চট্টগ্রামের ২২-৪৫ বছরের ছেলেরা, লেদার আর ফ্যাশনে আগ্রহী। দিনে ১৫০০ টাকা। প্রতি পারচেজ ৩০০ টাকার বেশি হলে বন্ধ করবে।",
          )}
        />
        <span className="text-xs text-zinc-500">
          {tr(
            `Say the audience, age, location, budget per day (${currency ?? ""}) and any rules. Missing parts get sensible defaults you can change.`,
            `অডিয়েন্স, বয়স, লোকেশন, দিনে বাজেট (${currency ?? ""}) আর নিয়ম লেখো। যা বলবে না, তা স্বাভাবিক মান দিয়ে বসবে, পরে বদলাতে পারবে।`,
          )}
        </span>
      </label>
      <input type="hidden" name="default_budget" value={defaultBudget} />

      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {tr(`Images or videos (up to ${MAX_FILES}, each becomes an ad)`, `ছবি বা ভিডিও (সর্বোচ্চ ${MAX_FILES}টি, প্রতিটি আলাদা বিজ্ঞাপন হবে)`)}
        </span>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-900/15 px-4 py-6 text-center text-zinc-500 hover:bg-white/50 dark:border-white/15 dark:hover:bg-white/[0.04]">
          <ImageIcon className="size-5" aria-hidden />
          <span>{tr("Choose files", "ফাইল বাছো")}</span>
          <span className="text-xs">JPG, PNG, MP4, MOV</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg glass-chip px-3 py-2">
                {f.type.startsWith("video/") ? <Video className="size-4 text-zinc-400" aria-hidden /> : <ImageIcon className="size-4 text-zinc-400" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-zinc-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button
                  type="button"
                  aria-label={tr("Remove", "সরাও")}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-zinc-400 hover:text-red-600"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(localError || (state && !state.ok)) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {localError ?? (state && !state.ok ? state.error : "")}
        </p>
      )}
      <button type="submit" disabled={busy || pages.length === 0} className={buttonClass("primary", "self-start")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {progress ?? tr("Make a plan", "পরিকল্পনা বানাও")}
      </button>
    </form>
  );
}
