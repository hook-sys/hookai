"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Meta Ads Agent
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          {mode === "signin"
            ? "লগইন করে তোমার বিজ্ঞাপনের হিসাব দেখো"
            : "নতুন অ্যাকাউন্ট তৈরি করো"}
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">ইমেইল</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">পাসওয়ার্ড</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>

          {state?.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="text-sm text-emerald-600">{state.message}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {pending
              ? "অপেক্ষা করো..."
              : mode === "signin"
                ? "লগইন"
                : "অ্যাকাউন্ট তৈরি করো"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          {mode === "signin"
            ? "নতুন? অ্যাকাউন্ট তৈরি করো"
            : "আগে থেকেই অ্যাকাউন্ট আছে? লগইন করো"}
        </button>
      </div>
    </main>
  );
}
