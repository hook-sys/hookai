"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, Plus, Upload } from "lucide-react";
import { useTr } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui";
import { COURIERS, COURIER_NAMES, CSV_TEMPLATE, ORDER_STATUSES, statusLabel, type KnownCampaign, type OrderStatus } from "@/lib/orders";
import { addOrder, importOrders, updateOrderStatus, type OrderFormState } from "./actions";
import { connectCourier, saveCarrybeeSecret } from "./courier-actions";
import type { CourierId } from "@/lib/couriers/common";

function Result({ state }: { state: OrderFormState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {state.error}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

export function AddOrderForm({ campaigns, today }: { campaigns: KnownCampaign[]; today: string }) {
  const tr = useTr();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(async (prev, data) => {
    const result = await addOrder(prev, data);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Order number", "অর্ডার নম্বর")}>
          <input name="external_id" required maxLength={100} placeholder="1001" className={inputClass} />
        </Field>
        <Field label={tr("Order date", "অর্ডারের তারিখ")}>
          <input name="order_date" type="date" required defaultValue={today} max={today} className={inputClass} />
        </Field>
      </div>
      <Field label={tr("Which campaign did it come from?", "কোন ক্যাম্পেইন থেকে এসেছে?")}>
        <select name="campaign_id" className={inputClass} defaultValue="">
          <option value="">{tr("Not sure / no campaign", "জানা নেই / ক্যাম্পেইন ছাড়া")}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Amount (৳)", "টাকার পরিমাণ (৳)")}>
          <input name="amount" inputMode="decimal" placeholder="1850" className={inputClass} />
        </Field>
        <Field label={tr("Status", "অবস্থা")}>
          <select name="status" defaultValue="pending" className={inputClass}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, tr)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Courier (optional)", "কুরিয়ার (ঐচ্ছিক)")}>
          <select name="courier" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {COURIERS.map((c) => (
              <option key={c} value={c}>
                {c === "other" ? tr("Other", "অন্য") : COURIER_NAMES[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("Tracking / consignment ID", "ট্র্যাকিং / কনসাইনমেন্ট ID")}>
          <input name="tracking_code" maxLength={100} className={inputClass} />
        </Field>
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        {tr("Save order", "অর্ডার সেভ করো")}
      </button>
    </form>
  );
}

export function ImportOrdersForm() {
  const tr = useTr();
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(importOrders, null);
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {tr(
          "Columns: order_id, date, campaign_id (or utm_id), campaign_name (or utm_campaign), amount, status, courier, tracking_code. Only order_id and date are required. Uploading the same order again updates its status.",
          "কলাম: order_id, date, campaign_id (বা utm_id), campaign_name (বা utm_campaign), amount, status, courier, tracking_code। শুধু order_id আর date বাধ্যতামূলক। একই অর্ডার আবার আপলোড করলে তার অবস্থা আপডেট হয়।",
        )}
      </p>
      <a href={templateHref} download="hook-orders-template.csv" className={buttonClass("ghost", "self-start px-0")}>
        <Download className="size-4" aria-hidden />
        {tr("Download sample CSV", "নমুনা CSV নামাও")}
      </a>
      <input
        name="file"
        type="file"
        required
        accept=".csv,text/csv"
        className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-200"
      />
      <Result state={state} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        {tr("Import orders", "অর্ডার আপলোড করো")}
      </button>
    </form>
  );
}

const COURIER_FIELDS: Record<CourierId, { name: string; label: string; secret?: boolean; type?: string }[]> = {
  steadfast: [
    { name: "api_key", label: "API key" },
    { name: "secret_key", label: "Secret key", secret: true },
  ],
  pathao: [
    { name: "client_id", label: "Client ID" },
    { name: "client_secret", label: "Client Secret", secret: true },
    { name: "username", label: "Email", type: "email" },
    { name: "password", label: "Password", secret: true },
  ],
  carrybee: [
    { name: "client_id", label: "Client-ID" },
    { name: "client_secret", label: "Client-Secret", secret: true },
    { name: "client_context", label: "Client-Context" },
  ],
};

export function CourierConnectForm({ courier, update = false }: { courier: CourierId; update?: boolean }) {
  const tr = useTr();
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(connectCourier, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="courier" value={courier} />
      {COURIER_FIELDS[courier].map((f) => (
        <Field key={f.name} label={f.label}>
          <input
            name={f.name}
            type={f.secret ? "password" : (f.type ?? "text")}
            required
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </Field>
      ))}
      <Result state={state} />
      <button type="submit" disabled={pending} className={buttonClass(update ? "secondary" : "primary", "self-start")}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {update ? tr("Update", "আপডেট করো") : tr("Connect", "কানেক্ট করো")}
      </button>
    </form>
  );
}

export function CarrybeeSecretForm({ hasSecret }: { hasSecret: boolean }) {
  const tr = useTr();
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(saveCarrybeeSecret, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Field label={tr("CarryBee's integration secret", "CarryBee-র integration secret")}>
        <input
          name="webhook_secret"
          type="password"
          required
          autoComplete="off"
          placeholder={hasSecret ? tr("Saved. Paste a new one to replace it.", "সেভ করা আছে। বদলাতে নতুনটা বসাও।") : "40489fe0-…"}
          className={inputClass}
        />
      </Field>
      <Result state={state} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "self-start")}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {tr("Save and open 10-minute setup", "সেভ করে ১০ মিনিটের সেটআপ খোলো")}
      </button>
    </form>
  );
}

// অবস্থা বদলালেই সেভ হয়
export function StatusSelect({ id, status, label }: { id: string; status: OrderStatus; label: string }) {
  const tr = useTr();
  return (
    <form action={updateOrderStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        aria-label={label}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s, tr)}
          </option>
        ))}
      </select>
    </form>
  );
}

export function CopyText({ text, secret = false }: { text: string; secret?: boolean }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
        {shown ? text : "•".repeat(24)}
      </code>
      {secret && (
        <button type="button" onClick={() => setShown((v) => !v)} className={buttonClass("ghost", "shrink-0")}>
          {shown ? tr("Hide", "লুকাও") : tr("Show", "দেখাও")}
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        className={buttonClass("secondary", "shrink-0")}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? tr("Copied", "কপি হয়েছে") : tr("Copy", "কপি")}
      </button>
    </div>
  );
}
