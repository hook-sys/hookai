import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// পুরো অ্যাপে একই ধরনের বোতাম, কার্ড ও ব্যাজ রাখার জন্য ছোট কিছু অংশ

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_8px_20px_-8px_rgb(74_111_202/0.8)] dark:hover:bg-indigo-400",
  secondary:
    "border border-white/80 bg-white/70 text-zinc-800 shadow-sm backdrop-blur hover:bg-white/90 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/10",
  ghost:
    "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  danger:
    "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950",
};

export function buttonClass(variant: ButtonVariant = "primary", extra?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], extra);
}

export const inputClass =
  "w-full rounded-xl border border-zinc-900/10 bg-white/75 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-white/[0.05] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)] dark:placeholder:text-zinc-500 dark:focus:border-indigo-400";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "glass-panel rounded-3xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-900/[0.06] px-5 py-4 dark:border-white/[0.07]">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "brand";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  brand: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type NoticeTone = "success" | "warning" | "danger" | "info";

const NOTICE_TONES: Record<NoticeTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
};

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: NoticeTone;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn("mb-6 rounded-xl border px-4 py-3 text-sm", NOTICE_TONES[tone])}
    >
      {children}
    </p>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

// Hook-এর লোগো চিহ্ন (cursor + তিনটি রশ্মি), নীল টাইলের উপর সাদা।
// src/app/icon.svg (ব্রাউজার ট্যাবের আইকন) হুবহু একই নকশা; বদলালে দুটোই বদলাতে হবে।
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#3157B0" />
      <g transform="translate(4 3)">
        <path
          d="M17 31.2 39.4 25.1c2.2-.6 3.6 1 3 3.1L36 49c-.7 2.1-3.4 2-3.9-.2l-2.2-10.6c-.3-1.5-1.5-2.5-3-2.7L18 34.6c-2.3-.3-3.1-2.8-1-3.4Z"
          fill="#fff"
        />
        <path d="M16 38.6l9.4.9c1.3.1 2.3 1.1 2.5 2.4l1.4 8.6H16Z" fill="#fff" />
        <path d="M16.6 17.6l3.2-1.2 7.3 8.2-3.5 1Z" fill="#FF7A4D" />
        <path d="M33.3 11.6l3.6-.7-.6 11.2-3.4.4Z" fill="#FF7A4D" />
        <path d="M47.6 15.4l2.4 2.6-6.6 6.2c-.5-1.2-1.3-2.1-2.4-2.6Z" fill="#FF7A4D" />
      </g>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="size-9 shadow-sm" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-bold tracking-wide text-[#3157B0] dark:text-zinc-50">
            HOOK <span className="text-[#FF5A2C]">AI</span>
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Meta Ads Agent
          </span>
        </span>
      )}
    </span>
  );
}
