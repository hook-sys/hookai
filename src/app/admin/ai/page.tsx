import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "@/lib/ai/providers";
import AppHeader from "@/components/AppHeader";
import { activateProvider, removeProviderKey, saveProviderConfig } from "./actions";
import TestButton from "./TestButton";

const STATUS: Record<string, { text: string; tone: string }> = {
  saved: { text: "সংরক্ষণ হয়েছে।", tone: "text-emerald-600" },
  activated: { text: "চালু করা হয়েছে। এখন থেকে সব AI কাজ এটি দিয়ে হবে।", tone: "text-emerald-600" },
  removed: { text: "কী মুছে ফেলা হয়েছে।", tone: "text-zinc-600" },
  no_key: { text: "আগে API key সংরক্ষণ করো, তারপর চালু করো।", tone: "text-amber-600" },
  bad_model: { text: "মডেলের নাম সঠিক নয়।", tone: "text-red-600" },
  bad_key: { text: "API key অস্বাভাবিক লম্বা।", tone: "text-red-600" },
  error: { text: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করো।", tone: "text-red-600" },
};

const input =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";
const primary =
  "w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900";

// কী-এর শেষ ৪ অক্ষর, যাতে কোন কী বসানো আছে চেনা যায়
function keyTail(encrypted: string | null) {
  if (!encrypted) return null;
  try {
    return decrypt(encrypted).slice(-4);
  } catch {
    return "????";
  }
}

type Props = { searchParams: Promise<{ status?: string; provider?: string }> };

export default async function AdminAiPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // অ্যাডমিন না হলে পেজটির অস্তিত্বই দেখানো হয় না
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();

  const [{ data: configs }, { data: settings }] = await Promise.all([
    supabase.from("ai_provider_configs").select("provider, api_key_encrypted, model, updated_at"),
    supabase.from("ai_settings").select("active_provider").eq("id", 1).maybeSingle(),
  ]);

  const byProvider = new Map((configs ?? []).map((c) => [c.provider, c]));
  const active = settings?.active_provider ?? null;
  const status = params.status ? STATUS[params.status] : undefined;

  return (
    <main className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      <AppHeader active="admin" />

      <div className="mb-6 max-w-3xl">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          সুপার অ্যাডমিন: AI প্রোভাইডার
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          যে প্রোভাইডার চালু থাকবে, অ্যাপের সব AI কাজ (সারসংক্ষেপ, সুপারিশ) সেটি দিয়েই হবে।
          কী এনক্রিপ্ট করে রাখা হয় এবং ব্রাউজারে কখনো পাঠানো হয় না।
        </p>
        <p className="mt-3 text-sm">
          এখন চালু:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {active ? AI_PROVIDERS[active as keyof typeof AI_PROVIDERS]?.label ?? active : "কোনোটি না"}
          </span>
        </p>
        {status && (
          <p className={`mt-2 text-sm ${status.tone}`}>
            {params.provider && AI_PROVIDERS[params.provider as keyof typeof AI_PROVIDERS]
              ? `${AI_PROVIDERS[params.provider as keyof typeof AI_PROVIDERS].label}: `
              : ""}
            {status.text}
          </p>
        )}
      </div>

      <div className="grid max-w-5xl gap-4 md:grid-cols-2">
        {AI_PROVIDER_IDS.map((id) => {
          const meta = AI_PROVIDERS[id];
          const cfg = byProvider.get(id);
          const tail = keyTail(cfg?.api_key_encrypted ?? null);
          const isActive = active === id;

          return (
            <section
              key={id}
              className={`flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900 ${
                isActive ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                  {meta.label}
                </h2>
                {isActive && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                    চালু
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-500">
                API key: {tail ? `সেট আছে (…${tail})` : "সেট নেই"} · কোথায় পাবে: {meta.keyHint}
              </p>

              <form action={saveProviderConfig} className="flex flex-col gap-3">
                <input type="hidden" name="provider" value={id} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">API key</span>
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={tail ? "নতুন কী দিলে আগেরটি বদলাবে" : "কী বসাও"}
                    className={input}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-700 dark:text-zinc-300">মডেল</span>
                  <input
                    name="model"
                    defaultValue={cfg?.model ?? ""}
                    placeholder={meta.defaultModel}
                    className={input}
                  />
                  <span className="text-xs text-zinc-400">
                    খালি রাখলে {meta.defaultModel} · {meta.modelHint}
                  </span>
                </label>
                <button type="submit" className={primary}>
                  সংরক্ষণ করো
                </button>
              </form>

              {tail && (
                <div className="flex flex-col gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <TestButton provider={id} />
                  <div className="flex flex-wrap gap-3">
                    {!isActive && (
                      <form action={activateProvider}>
                        <input type="hidden" name="provider" value={id} />
                        <button type="submit" className={primary}>
                          এটি চালু করো
                        </button>
                      </form>
                    )}
                    <form action={removeProviderKey}>
                      <input type="hidden" name="provider" value={id} />
                      <button type="submit" className="text-sm text-red-600 underline">
                        কী মুছে দাও
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
