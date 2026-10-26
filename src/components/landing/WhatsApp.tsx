import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { whatsappLink } from "./results";

export function WhatsAppIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.45-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.44-9.44 9.44zm8.03-17.47A11.3 11.3 0 0 0 12.05.7C5.79.7.69 5.8.69 12.06c0 2 .52 3.95 1.52 5.67L.6 23.3l5.7-1.5a11.32 11.32 0 0 0 5.74 1.47h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.04-1.18-5.89-3.33-8.04z" />
    </svg>
  );
}

// সব CTA একই নম্বরে WhatsApp চ্যাট খোলে, সাথে একটা তৈরি বার্তা
export function WhatsAppButton({
  children,
  message,
  size = "lg",
  className,
}: {
  children: ReactNode;
  message: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-[#1fa855] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(31_168_85/0.8)] transition-colors hover:bg-[#178f47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1fa855]",
        size === "lg" ? "px-6 py-3.5 text-base" : "px-4 py-2 text-sm",
        className,
      )}
    >
      <WhatsAppIcon className={size === "lg" ? "size-5" : "size-4"} />
      {children}
    </a>
  );
}
