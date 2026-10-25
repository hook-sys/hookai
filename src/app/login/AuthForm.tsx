"use client";

import { SIGNUP_OPEN } from "@/lib/site";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Logo, buttonClass, inputClass } from "@/components/ui";
import { useTr } from "@/components/I18nProvider";
import LanguageSwitch from "@/components/LanguageSwitch";
import { signIn, signUp, type AuthState } from "./actions";

// লগইন ও নতুন অ্যাকাউন্ট একই ফর্মে; /signup লিংক সরাসরি অ্যাকাউন্ট খোলার ধাপে খোলে
export default function AuthForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const tr = useTr();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);

  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  const points = [
    tr("Read-only access. Hook never edits your ads.", "শুধু পড়ার অনুমতি। Hook তোমার বিজ্ঞাপনে হাত দেয় না।"),
    tr("Numbers that match Ads Manager, in your time zone.", "Ads Manager-এর সাথে মেলা সংখ্যা, তোমার timezone-এ।"),
    tr("Alerts and advice in plain words.", "অ্যালার্ট আর পরামর্শ, সহজ কথায়।"),
  ];

  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="aurora grain pointer-events-none fixed inset-0 -z-10" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label={tr("Hook AI home", "Hook AI হোম")}>
          <Logo />
        </Link>
        <LanguageSwitch />
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-16 sm:px-6 lg:min-h-[calc(100vh-6rem)] lg:grid-cols-[1fr_440px] lg:pt-0">
        <section className="hidden lg:block">
          <h1 className="max-w-lg text-5xl leading-[1.08] font-semibold tracking-tight text-zinc-950 dark:text-white">
            {tr("Your ad account, ", "তোমার Ad Account, ")}
            <em className="font-serif font-normal text-indigo-700 italic dark:text-indigo-300">
              {tr("finally explained.", "অবশেষে সহজ ভাষায়।")}
            </em>
          </h1>
          <ul className="mt-10 max-w-md space-y-4">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-zinc-700 dark:text-zinc-300">
                <span className="mt-2.5 h-px w-5 shrink-0 bg-zinc-400" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-3xl p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {mode === "signin" ? tr("Welcome back", "আবার স্বাগতম") : tr("Create your account", "নতুন অ্যাকাউন্ট")}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin"
              ? tr("Log in to see how your ads are doing.", "লগইন করে তোমার বিজ্ঞাপনের হিসাব দেখো")
              : tr("Takes less than a minute.", "কয়েক সেকেন্ডে অ্যাকাউন্ট তৈরি করো")}
          </p>

          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Email", "ইমেইল")}</span>
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
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Password", "পাসওয়ার্ড")}</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={tr("At least 8 characters", "কমপক্ষে ৮ অক্ষর")}
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

            <button type="submit" disabled={pending} className={buttonClass("primary", "mt-2 w-full rounded-xl py-2.5")}>
              {pending
                ? tr("Please wait…", "অপেক্ষা করো...")
                : mode === "signin"
                  ? tr("Log in", "লগইন")
                  : tr("Create account", "অ্যাকাউন্ট তৈরি করো")}
            </button>
          </form>

          {mode === "signup" && (
            <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {tr("By creating an account you agree to our ", "অ্যাকাউন্ট তৈরি করলে তুমি আমাদের ")}
              <Link href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">Terms</Link>
              {tr(" and ", " ও ")}
              <Link href="/privacy" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">Privacy Policy</Link>
              {tr(".", " মেনে নিচ্ছ।")}
            </p>
          )}

          {SIGNUP_OPEN && (
          <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin" ? tr("New here?", "নতুন?") : tr("Already have an account?", "আগে থেকেই অ্যাকাউন্ট আছে?")}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {mode === "signin" ? tr("Create an account", "অ্যাকাউন্ট তৈরি করো") : tr("Log in", "লগইন করো")}
            </button>
          </p>
          )}
        </section>
      </main>
    </div>
  );
}
