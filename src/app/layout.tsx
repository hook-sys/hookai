import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Inter, Instrument_Serif } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import { getLocale } from "@/lib/i18n-server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bengali = Hind_Siliguri({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Editorial accent face for a few words on the landing page
const serif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Needed to build absolute URLs for share links and images
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Hook AI · Meta Ads Agent",
    template: "%s · Hook AI",
  },
  description: "See where your Meta ad budget is working and where it is leaking. Reports, alerts and plain-language advice in one place.",
};

// Tell the browser before first paint that the page supports light and dark
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${bengali.variable} ${serif.variable} font-sans`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
