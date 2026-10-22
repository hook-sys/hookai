import { notFound } from "next/navigation";
import { Bot, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { AI_PROVIDERS, AI_PROVIDER_IDS, isAiProvider } from "@/lib/ai/providers";
import AppShell from "@/components/AppShell";
import {
  Badge,
  Card,
  Notice,
  PageHeader,
  buttonClass,
  cn,
  inputClass,
} from "@/components/ui";
import { activateProvider, removeProviderKey, saveProviderConfig } from "./actions";
import TestButton from "./TestButton";

export const metadata = { title: "সুপার অ্যাডমিন" };

const STATUS: Record<string, { text: string; tone: "success" | "warning" | "danger" | "info" }> = {
  saved: { text: "সংরক্ষণ হয়েছে।", tone: "success" },
  activated: { text: "চালু করা হয়েছে। এখন থেকে সব AI কাজ এটি দিয়ে হবে।", tone: "success" },
  removed: { text: "কী মুছে ফেলা হয়েছে।", tone: "info" },
  no_key: { text: "আগে API key সংরক্ষণ করো, তারপর চালু করো।", tone: "warning" },
  bad_model: { text: "মডেলের নাম সঠিক নয়।", tone: "danger" },
  bad_key: { text: "API key অস্বাভাবিক লম্বা।", tone: "danger" },
  error: { text: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করো।", tone: "danger" },
};

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
  const active =
    settings?.active_provider && isAiProvider(settings.active_provider)
      ? settings.active_provider
      : null;
  const status = params.status ? STATUS[params.status] : undefined;
  const statusProvider =
    params.provider && isAiProvider(params.provider) ? AI_PROVIDERS[params.provider].label : null;

  return (
    <AppShell active="admin">
      <PageHeader
        title="AI প্রোভাইডার"
        description="যে প্রোভাইডার চালু থাকবে, অ্যাপের সব AI কাজ (সারসংক্ষেপ, সুপারিশ) সেটি দিয়েই হবে। কী এনক্রিপ্ট করে রাখা হয়, ব্রাউজারে কখনো পাঠানো হয় না।"
        actions={
          <Badge tone={active ? "success" : "warning"}>
            <Bot className="size-3.5" aria-hidden />
            {active ? `চালু: ${AI_PROVIDERS[active].label}` : "কোনো প্রোভাইডার চালু নেই"}
          </Badge>
        }
      />

      {status && (
        <Notice tone={status.tone}>
          {statusProvider && `${statusProvider}: `}
          {status.text}
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {AI_PROVIDER_IDS.map((id) => {
          const meta = AI_PROVIDERS[id];
          const cfg = byProvider.get(id);
          const tail = keyTail(cfg?.api_key_encrypted ?? null);
          const isActive = active === id;

          return (
            <Card
              key={id}
              className={cn(
                "flex flex-col",
                isActive && "ring-2 ring-indigo-500 dark:ring-indigo-400",
              )}
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {meta.label}
                </h2>
                {isActive ? (
                  <Badge tone="success">চালু</Badge>
                ) : tail ? (
                  <Badge tone="brand">কী সেট আছে</Badge>
                ) : (
                  <Badge>সেট নেই</Badge>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-4 px-5 py-5">
                <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <KeyRound className="size-3.5" aria-hidden />
                  {tail ? `বর্তমান কী …${tail}` : "কী বসানো নেই"} · কোথায় পাবে: {meta.keyHint}
                </p>

                <form action={saveProviderConfig} className="flex flex-col gap-3">
                  <input type="hidden" name="provider" value={id} />
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">API key</span>
                    <input
                      name="apiKey"
                      type="password"
                      autoComplete="off"
                      placeholder={tail ? "নতুন কী দিলে আগেরটি বদলাবে" : "কী বসাও"}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">মডেল</span>
                    <input
                      name="model"
                      defaultValue={cfg?.model ?? ""}
                      placeholder={meta.defaultModel}
                      className={cn(inputClass, "font-mono")}
                    />
                    <span className="text-xs text-zinc-400">
                      খালি রাখলে {meta.defaultModel} · {meta.modelHint}
                    </span>
                  </label>
                  <button type="submit" className={buttonClass("secondary", "w-fit")}>
                    সংরক্ষণ করো
                  </button>
                </form>

                {tail && (
                  <div className="mt-auto flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <TestButton provider={id} />
                    <div className="flex flex-wrap items-center gap-2">
                      {!isActive && (
                        <form action={activateProvider}>
                          <input type="hidden" name="provider" value={id} />
                          <button type="submit" className={buttonClass("primary")}>
                            এটি চালু করো
                          </button>
                        </form>
                      )}
                      <form action={removeProviderKey}>
                        <input type="hidden" name="provider" value={id} />
                        <button type="submit" className={buttonClass("danger")}>
                          কী মুছে দাও
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
