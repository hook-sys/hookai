"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Bot, Check, Loader2, Send, Trash2, X } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { approveProposal, clearChat, rejectProposal, sendMessage, type AssistantState } from "./actions";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal: { action: string; args: Record<string, unknown>; summary: string } | null;
  proposal_status: "pending" | "approved" | "rejected" | "done" | "failed" | null;
  result: string | null;
  model: string | null;
  cost_usd: number | null;
  created_at: string;
};

const EXAMPLES: [string, string][] = [
  ["How did the ads do yesterday?", "গতকাল বিজ্ঞাপন কেমন চলেছে?"],
  ["Make a 50% video viewers audience for 30 days", "৩০ দিনের ৫০% ভিডিও দেখা অডিয়েন্স বানাও"],
  ["Which campaign has the worst delivery rate this week?", "এই সপ্তাহে কোন ক্যাম্পেইনের ডেলিভারি রেট সবচেয়ে খারাপ?"],
  ["Is the pixel working?", "Pixel ঠিকমতো কাজ করছে?"],
];

function ProposalCard({ m }: { m: ChatMessage }) {
  const tr = useTr();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = m.proposal!;
  const run = (fn: (id: string) => Promise<AssistantState>) =>
    start(async () => {
      const r = await fn(m.id);
      setError(r && !r.ok ? r.error : null);
    });

  const status = {
    pending: null,
    approved: tr("Running…", "চলছে…"),
    done: tr("Done", "হয়ে গেছে"),
    failed: tr("Failed", "হয়নি"),
    rejected: tr("Cancelled", "বাতিল"),
  }[m.proposal_status ?? "pending"];

  return (
    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
      <div className="font-medium text-amber-900 dark:text-amber-200">{tr("Waiting for your approval", "তোমার অনুমোদনের অপেক্ষায়")}</div>
      <div className="mt-1 text-zinc-800 dark:text-zinc-200">{p.summary || p.action}</div>
      <details className="mt-1 text-xs text-zinc-500">
        <summary className="cursor-pointer">{tr("Details", "বিস্তারিত")}</summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify({ action: p.action, ...p.args }, null, 2)}</pre>
      </details>
      {m.proposal_status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={pending} onClick={() => run(approveProposal)} className={buttonClass("primary", "gap-1.5")}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {tr("Approve and run", "অনুমোদন দাও, চালাও")}
          </button>
          <button type="button" disabled={pending} onClick={() => run(rejectProposal)} className={buttonClass("secondary", "gap-1.5")}>
            <X className="size-4" />
            {tr("Cancel", "বাতিল")}
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "mt-2 text-sm font-medium",
            m.proposal_status === "done" ? "text-emerald-700 dark:text-emerald-400" : m.proposal_status === "failed" ? "text-red-600" : "text-zinc-500",
          )}
        >
          {status}
          {m.result ? `: ${m.result}` : ""}
        </div>
      )}
      {error && <div className="mt-2 text-red-600">{error}</div>}
    </div>
  );
}

export default function AssistantChat({ messages, model, monthCost }: { messages: ChatMessage[]; model: string | null; monthCost: number }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<AssistantState, FormData>(sendMessage, null);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [clearing, startClear] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending) setSent(null);
  }, [pending]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>
          {tr("Model", "মডেল")}: <span className="font-mono">{model ?? "—"}</span> · {tr("This month", "এই মাসে")}: ${monthCost.toFixed(2)} (≈ ৳
          {Math.round(monthCost * 122)})
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            disabled={clearing}
            onClick={() => {
              if (confirm(tr("Clear this chat?", "এই চ্যাট মুছে ফেলবে?"))) startClear(async () => void (await clearChat()));
            }}
            className="inline-flex items-center gap-1 hover:text-red-600"
          >
            <Trash2 className="size-3.5" />
            {tr("Clear chat", "চ্যাট মুছো")}
          </button>
        )}
      </div>

      <div className="flex min-h-[40vh] flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        {messages.length === 0 && !sent && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-zinc-500">
            <Bot className="size-8 text-indigo-500" />
            <p>{tr("Ask anything about this client's ads, or tell me what to do.", "এই ক্লায়েন্টের বিজ্ঞাপন নিয়ে যা খুশি জিজ্ঞেস করো, বা কী করতে হবে বলো।")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map(([en, bn]) => (
                <button key={en} type="button" onClick={() => setDraft(tr(en, bn))} className="rounded-full border border-zinc-200 px-3 py-1 text-xs hover:border-indigo-400 dark:border-zinc-700">
                  {tr(en, bn)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%]",
                m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
              )}
            >
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              {m.proposal && <ProposalCard m={m} />}
              {m.role === "assistant" && m.cost_usd !== null && (
                <div className="mt-1.5 text-[11px] text-zinc-400">${Number(m.cost_usd).toFixed(3)}</div>
              )}
            </div>
          </div>
        ))}
        {sent && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm text-white">{sent}</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              {tr("Looking at the data…", "ডাটা দেখছি…")}
            </div>
          </>
        )}
        <div ref={end} />
      </div>

      {state && !state.ok && <div className="text-sm text-red-600">{state.error}</div>}

      <form
        ref={form}
        action={(fd) => {
          setSent(String(fd.get("message") ?? ""));
          setDraft("");
          action(fd);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          name="message"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (draft.trim() && !pending) form.current?.requestSubmit();
            }
          }}
          maxLength={4000}
          placeholder={tr("Write a question or a task…", "প্রশ্ন বা কাজ লেখো…")}
          aria-label={tr("Message", "বার্তা")}
          className={cn(inputClass, "min-h-[3rem] flex-1 resize-y")}
        />
        <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("primary", "h-12 gap-1.5")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="hidden sm:inline">{tr("Send", "পাঠাও")}</span>
        </button>
      </form>
    </div>
  );
}
