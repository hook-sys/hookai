"use client";

import { useActionState, useState } from "react";
import { BarChart3, BellRing, Sparkles, type LucideIcon } from "lucide-react";
import { Logo, buttonClass, inputClass } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: BarChart3,
    title: "এক নজরে সব হিসাব",
    text: "খরচ, Purchase, CPA, ROAS প্রতিটি ক্যাম্পেইনের জন্য আলাদা করে।",
  },
  {
    icon: BellRing,
    title: "সময়মতো অ্যালার্ট",
    text: "খরচ হঠাৎ বাড়লে বা Ad ক্লান্ত হয়ে গেলে সাথে সাথে জানবে।",
  },
  {
    icon: Sparkles,
    title: "AI সুপারিশ",
    text: "কোন Ad চালু রাখবে, কোনটা বন্ধ করবে, সহজ বাংলায় পরামর্শ।",
  },
];

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-base font-bold">
            H
          </span>
          <span className="text-sm font-semibold">Hook AI</span>
        </div>

        <div className="my-auto max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            তোমার Meta বিজ্ঞাপন, এখন AI-এর চোখে
          </h1>
          <p className="mt-4 text-indigo-100">
            Ad Account কানেক্ট করো, বাকি হিসাব আর বিশ্লেষণ আমরা করে দেব।
          </p>

          <ul className="mt-10 flex flex-col gap-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-indigo-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* পেছনের হালকা আলো */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-violet-400/30 blur-3xl"
        />
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {mode === "signin" ? "আবার স্বাগতম" : "নতুন অ্যাকাউন্ট"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin"
              ? "লগইন করে তোমার বিজ্ঞাপনের হিসাব দেখো"
              : "কয়েক সেকেন্ডে অ্যাকাউন্ট তৈরি করো"}
          </p>

          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">ইমেইল</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">পাসওয়ার্ড</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="কমপক্ষে ৮ অক্ষর"
                className={inputClass}
              />
            </label>

            {state?.error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {state.error}
              </p>
            )}
            {state?.message && (
              <p
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              >
                {state.message}
              </p>
            )}

            <button type="submit" disabled={pending} className={buttonClass("primary", "mt-2 w-full py-2.5")}>
              {pending
                ? "অপেক্ষা করো..."
                : mode === "signin"
                  ? "লগইন"
                  : "অ্যাকাউন্ট তৈরি করো"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin" ? "নতুন?" : "আগে থেকেই অ্যাকাউন্ট আছে?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {mode === "signin" ? "অ্যাকাউন্ট তৈরি করো" : "লগইন করো"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
