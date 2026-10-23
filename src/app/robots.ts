import type { MetadataRoute } from "next";

// পাবলিক পেজ সার্চ ইঞ্জিনে আসবে; লগইনের পেছনের পেজ নয়
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/settings", "/admin", "/api", "/auth"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
