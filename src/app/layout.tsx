import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
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

export const metadata: Metadata = {
  // শেয়ারের লিংক ও ছবির পূর্ণ ঠিকানা তৈরিতে লাগে
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Hook AI · Meta Ads Agent",
    template: "%s · Hook AI",
  },
  description: "Meta বিজ্ঞাপনের হিসাব, অ্যালার্ট ও AI সুপারিশ এক জায়গায়",
};

// প্রথম রেন্ডারের আগেই ব্রাউজার জানবে পেজটি লাইট ও ডার্ক দুটোই সমর্থন করে
export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body className={`${inter.variable} ${bengali.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
