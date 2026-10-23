"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { useTr } from "@/components/I18nProvider";
import { deleteAccount, type DeleteAccountState } from "./actions";

// ভুল করে চাপ না পড়ে, তাই প্রথমে খুলতে হয়, তারপর ইমেইল লিখে নিশ্চিত করতে হয়
export default function DeleteAccount({ email }: { email: string }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("danger", "-ml-4 w-fit")}>
        <Trash2 className="size-4" aria-hidden />
        {tr("Delete account", "অ্যাকাউন্ট মুছে ফেলো")}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm text-red-800 dark:text-red-200">
        {tr(
          "This permanently deletes your account, Meta connection, all ad data, AI reports and alerts. It can't be undone.",
          "এতে তোমার অ্যাকাউন্ট, Meta সংযোগ, সব বিজ্ঞাপনের ডাটা, AI রিপোর্ট ও অ্যালার্ট স্থায়ীভাবে মুছে যাবে। আর ফেরত আনা যাবে না।",
        )}
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-red-800 dark:text-red-200">
          {tr("To confirm, type: ", "নিশ্চিত করতে লেখো: ")}
          <span className="font-mono font-medium">{email}</span>
        </span>
        <input name="confirm_email" type="email" autoComplete="off" required className={inputClass} />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {tr("Delete permanently", "স্থায়ীভাবে মুছে ফেলো")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
          {tr("Cancel", "বাতিল")}
        </button>
      </div>
    </form>
  );
}
