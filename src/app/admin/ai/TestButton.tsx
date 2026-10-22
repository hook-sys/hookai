"use client";

import { useActionState } from "react";
import { testProvider, type TestState } from "./actions";

export default function TestButton({ provider }: { provider: string }) {
  const [state, formAction, pending] = useActionState<TestState, FormData>(
    testProvider,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "পরীক্ষা চলছে..." : "সংযোগ পরীক্ষা করো"}
      </button>
      {state && (
        <p
          role="status"
          className={`text-sm ${state.ok ? "text-emerald-600" : "text-red-600"}`}
        >
          {state.ok ? "কাজ করছে: " : "ব্যর্থ: "}
          {state.message}
        </p>
      )}
    </form>
  );
}
