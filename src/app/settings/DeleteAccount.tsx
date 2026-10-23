"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { deleteAccount, type DeleteAccountState } from "./actions";

// ভুল করে চাপ না পড়ে, তাই প্রথমে খুলতে হয়, তারপর ইমেইল লিখে নিশ্চিত করতে হয়
export default function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("danger", "-ml-4 w-fit")}>
        <Trash2 className="size-4" aria-hidden />
        অ্যাকাউন্ট মুছে ফেলো
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm text-red-800 dark:text-red-200">
        এতে তোমার অ্যাকাউন্ট, Meta সংযোগ, সব বিজ্ঞাপনের ডাটা, AI রিপোর্ট ও অ্যালার্ট স্থায়ীভাবে মুছে
        যাবে। আর ফেরত আনা যাবে না।
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-red-800 dark:text-red-200">
          নিশ্চিত করতে লেখো: <span className="font-mono font-medium">{email}</span>
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
          স্থায়ীভাবে মুছে ফেলো
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
          বাতিল
        </button>
      </div>
    </form>
  );
}
