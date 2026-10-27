"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { Card, CardHeader, buttonClass, inputClass } from "@/components/ui";
import { saveWhatsApp, testWhatsApp, type RuleState } from "./actions";

// অ্যালার্ট WhatsApp-এ পাঠানোর সেটিং। গোপন key সংরক্ষণের পর আর দেখানো হয় না।
export default function WhatsAppForm({
  provider,
  to,
  hasCredentials,
  alertsEnabled,
}: {
  provider: "callmebot" | "meta_cloud" | null;
  to: string;
  hasCredentials: boolean;
  alertsEnabled: boolean;
}) {
  const tr = useTr();
  const [state, action, pending] = useActionState<RuleState, FormData>(saveWhatsApp, null);
  const [p, setP] = useState<string>(provider ?? "");
  const [test, setTest] = useState<RuleState>(null);
  const [testing, startTest] = useTransition();
  const keyHint = hasCredentials ? tr("Saved. Leave empty to keep it.", "সংরক্ষিত আছে। একই রাখতে খালি রাখো।") : undefined;

  return (
    <Card>
      <CardHeader icon={MessageCircle} title={tr("WhatsApp alerts", "WhatsApp অ্যালার্ট")} />
      <form action={action} className="flex flex-col gap-3 p-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="alerts_enabled" defaultChecked={alertsEnabled} className="accent-indigo-600" />
          {tr("Alerts on (rejected ads, account and pixel problems, rule actions)", "অ্যালার্ট চালু (বিজ্ঞাপন বাতিল, অ্যাকাউন্ট ও Pixel সমস্যা, নিয়মের কাজ)")}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Send with", "যেভাবে পাঠাবে")}</span>
          <select name="provider" value={p} onChange={(e) => setP(e.target.value)} className={inputClass}>
            <option value="">{tr("Don't send to WhatsApp (only in Hook)", "WhatsApp-এ নয় (শুধু Hook-এ)")}</option>
            <option value="callmebot">{tr("CallMeBot (free, 2-minute setup)", "CallMeBot (ফ্রি, ২ মিনিটে সেটআপ)")}</option>
            <option value="meta_cloud">{tr("Meta WhatsApp Cloud API (official)", "Meta WhatsApp Cloud API (অফিশিয়াল)")}</option>
          </select>
        </label>
        {p && (
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Your WhatsApp number", "তোমার WhatsApp নম্বর")}</span>
            <input name="to" defaultValue={to} placeholder="01XXXXXXXXX" inputMode="tel" className={inputClass} />
          </label>
        )}
        {p === "callmebot" && (
          <>
            <p className="rounded-lg glass-chip px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
              {tr(
                'Open the CallMeBot page, save their WhatsApp number, send it "I allow callmebot to send me messages", and paste the API key it replies with.',
                'CallMeBot-এর পাতা খুলে ওদের WhatsApp নম্বর সেভ করো, সেখানে পাঠাও "I allow callmebot to send me messages"। উত্তরে যে API key আসবে, সেটা এখানে দাও।',
              )}{" "}
              <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer" className="text-indigo-600 underline dark:text-indigo-300">
                callmebot.com
              </a>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">API key</span>
              <input name="apikey" autoComplete="new-password" className={inputClass} />
              {keyHint && <span className="text-xs text-zinc-500">{keyHint}</span>}
            </label>
          </>
        )}
        {p === "meta_cloud" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Phone number ID</span>
              <input name="phone_number_id" inputMode="numeric" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Access token</span>
              <input name="wa_token" autoComplete="new-password" className={inputClass} />
              {keyHint && <span className="text-xs text-zinc-500">{keyHint}</span>}
            </label>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Template name", "Template-এর নাম")}</span>
                <input name="template" defaultValue="hook_alert" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{tr("Lang", "ভাষা")}</span>
                <input name="lang" defaultValue="en" className={inputClass} />
              </label>
            </div>
          </>
        )}
        {state && (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {state.ok ? state.message : state.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {tr("Save", "সংরক্ষণ")}
          </button>
          {provider && hasCredentials && (
            <button type="button" disabled={testing} onClick={() => startTest(async () => setTest(await testWhatsApp()))} className={buttonClass("secondary")}>
              {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {tr("Send test", "টেস্ট পাঠাও")}
            </button>
          )}
        </div>
        {test && (
          <p role={test.ok ? "status" : "alert"} className={test.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {test.ok ? test.message : test.error}
          </p>
        )}
      </form>
    </Card>
  );
}
