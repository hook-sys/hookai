"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { Badge, cn } from "@/components/ui";
import { LIMITS, type AdCopy, type CtaType } from "@/lib/ai/adCopyShared";

function CopyButton({ text }: { text: string }) {
  const tr = useTr();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // ক্লিপবোর্ড বন্ধ থাকলে কিছু করার নেই; ব্যবহারকারী নিজে সিলেক্ট করে কপি করবে
        }
      }}
      aria-label={tr("Copy", "কপি করো")}
      className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {done ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}

function Item({ text, limit, multiline }: { text: string; limit: number; multiline?: boolean }) {
  const tr = useTr();
  // Primary text-এর ক্ষেত্রে প্রথম দুই লাইন গোনা হয় (Feed-এ যতটুকু আগে দেখা যায়)
  const measured = multiline ? text.split("\n").slice(0, 2).join(" ") : text;
  const over = [...measured].length > limit;
  return (
    <li className="flex gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className={cn("min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-200", multiline && "whitespace-pre-line")}>{text}</p>
      <div className="flex flex-col items-end gap-1">
        <CopyButton text={text} />
        <span
          className={cn("text-[11px] tabular-nums", over ? "text-amber-600 dark:text-amber-400" : "text-zinc-400")}
          title={
            multiline
              ? tr("Characters in the first two lines", "প্রথম দুই লাইনের অক্ষর")
              : tr("Characters", "অক্ষর")
          }
        >
          {[...measured].length}/{limit}
        </span>
      </div>
    </li>
  );
}

export default function CopyResult({ copy }: { copy: AdCopy }) {
  const tr = useTr();
  const ctaLabel: Record<CtaType, string> = {
    SHOP_NOW: "Shop now",
    ORDER_NOW: "Order now",
    SEND_MESSAGE: "Send message",
    LEARN_MORE: "Learn more",
    GET_OFFER: "Get offer",
    SIGN_UP: "Sign up",
    BOOK_NOW: "Book now",
    CONTACT_US: "Contact us",
  };
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Primary text</h3>
        <ul className="flex flex-col gap-2">
          {copy.primary_texts.map((t, i) => (
            <Item key={i} text={t} limit={LIMITS.primary} multiline />
          ))}
        </ul>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Headline</h3>
          <ul className="flex flex-col gap-2">
            {copy.headlines.map((t, i) => (
              <Item key={i} text={t} limit={LIMITS.headline} />
            ))}
          </ul>
        </section>
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Description</h3>
            <ul className="flex flex-col gap-2">
              {copy.descriptions.map((t, i) => (
                <Item key={i} text={t} limit={LIMITS.description} />
              ))}
            </ul>
          </section>
          {copy.ctas.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {tr("Call-to-action button", "CTA বাটন")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {copy.ctas.map((c, i) => (
                  <Badge key={c} tone={i === 0 ? "brand" : "neutral"}>
                    {i === 0 && "★ "}
                    {ctaLabel[c]}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
