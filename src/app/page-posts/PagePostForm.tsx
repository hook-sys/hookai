"use client";

import { useActionState, useState, useTransition } from "react";
import { ImageIcon, Loader2, Save, Video, X } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { createPagePostDraft, type PagePostState } from "./actions";

const MAX_IMAGE = 30 * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;

// নতুন পেজ পোস্টের ফর্ম: পেজ বাছাই, লেখা, ছবি/ভিডিও (আপলোড বা Drive লিংক), চাইলে শিডিউল — সবসময় খসড়া হয়
export default function PagePostForm({
  userId,
  pages,
  defaultPageId,
}: {
  userId: string;
  pages: { id: string; name: string }[];
  defaultPageId?: string;
}) {
  const tr = useTr();
  const [state, action] = useActionState<PagePostState, FormData>(createPagePostDraft, null);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    setLocalError(null);
    if (!f) return setFile(null);
    const video = f.type.startsWith("video/");
    if (!video && !f.type.startsWith("image/")) {
      return setLocalError(tr("Only images and videos are allowed.", "শুধু ছবি আর ভিডিও দেওয়া যায়।"));
    }
    if (f.size > (video ? MAX_VIDEO : MAX_IMAGE)) {
      return setLocalError(tr(`${f.name} is too large.`, `${f.name} অনেক বড়।`));
    }
    setFile(f);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    const data = new FormData(e.currentTarget);
    const page = pages.find((p) => p.id === data.get("page_id"));
    data.set("page_name", page?.name ?? "");

    // আপলোড থাকলে ফাইলটা সরাসরি ব্রাউজার থেকে নিজের ফোল্ডারে যায় (launch-এর মতোই)
    if (file) {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${userId}/posts/${Date.now()}-0.${ext}`;
      setProgress(tr("Uploading…", "আপলোড হচ্ছে…"));
      const { error } = await supabase.storage.from("ad-media").upload(path, file, { contentType: file.type, upsert: false });
      setProgress(null);
      if (error) return setLocalError(tr(`Upload failed: ${error.message}`, `আপলোড হয়নি: ${error.message}`));
      data.set("media", JSON.stringify([{ path, kind: file.type.startsWith("video/") ? "video" : "image", name: file.name }]));
      data.set("drive_link", "");
    }
    setProgress(tr("Saving draft…", "খসড়া রাখা হচ্ছে…"));
    startTransition(async () => {
      await action(data);
      setProgress(null);
    });
  };

  const busy = pending || progress !== null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Facebook page", "Facebook পেজ")}</span>
        <select
          name="page_id"
          required
          className={inputClass}
          defaultValue={pages.some((p) => p.id === defaultPageId) ? defaultPageId : pages[0]?.id}
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Post text", "পোস্টের লেখা")}</span>
        <textarea
          name="caption"
          rows={5}
          maxLength={5000}
          className={inputClass}
          placeholder={tr("Write what the post says…", "পোস্টে যা বলতে চাও লেখো…")}
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Image or video (optional)", "ছবি বা ভিডিও (না দিলেও হয়)")}</span>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-900/15 px-4 py-5 text-center text-zinc-500 hover:bg-white/50 dark:border-white/15 dark:hover:bg-white/[0.04]">
          <ImageIcon className="size-5" aria-hidden />
          <span>{tr("Upload a file", "ফাইল আপলোড করো")}</span>
          <span className="text-xs">JPG, PNG, MP4, MOV</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="sr-only"
            onChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {file && (
          <div className="flex items-center gap-2 rounded-lg glass-chip px-3 py-2">
            {file.type.startsWith("video/") ? <Video className="size-4 text-zinc-400" aria-hidden /> : <ImageIcon className="size-4 text-zinc-400" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-xs text-zinc-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" aria-label={tr("Remove", "সরাও")} onClick={() => setFile(null)} className="rounded p-0.5 text-zinc-400 hover:text-red-600">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        <span className="text-xs text-zinc-500">{tr("or paste a Google Drive link (file must be shared as 'Anyone with the link')", "অথবা Google Drive লিংক দাও (ফাইলটা 'Anyone with the link' শেয়ার করা থাকতে হবে)")}</span>
        <input
          name="drive_link"
          type="url"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          placeholder="https://drive.google.com/file/d/…"
          className={inputClass}
          disabled={Boolean(file)}
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Schedule (optional, Dhaka time)", "শিডিউল (না দিলেও হয়, ঢাকার সময়)")}</span>
        <input name="scheduled_at" type="datetime-local" className={inputClass} />
        <span className="text-xs text-zinc-500">
          {tr("Even with a schedule, nothing publishes until you approve the draft below.", "শিডিউল থাকলেও, নিচে খসড়াটা approve না করলে কিছুই প্রকাশ হবে না।")}
        </span>
      </label>

      {(localError || (state && !state.ok)) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {localError ?? (state && !state.ok ? state.error : "")}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={busy || pages.length === 0} className={buttonClass("primary", "self-start")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
        {progress ?? tr("Save as draft", "খসড়া হিসেবে রাখো")}
      </button>
    </form>
  );
}
