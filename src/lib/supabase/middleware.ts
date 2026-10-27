import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// প্রতিটি রিকোয়েস্টে session রিফ্রেশ করে; লগইন না থাকলে /login-এ পাঠায়
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() ব্যবহার করতে হবে, getSession() নয় (সার্ভার-সাইড যাচাইয়ের জন্য)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // ল্যান্ডিং পেজ, ব্লগ, আইনি পেজ, লগইন ও সার্চ ইঞ্জিনের ফাইল লগইন ছাড়াই দেখা যায়
  const isPublicPath =
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/data-deletion" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/login") ||
    pathname === "/signup" ||
    pathname.startsWith("/auth") ||
    // কুরিয়ারের webhook লগইন ছাড়া আসে; নিজের token দিয়ে যাচাই হয়
    pathname.startsWith("/api/webhooks/") ||
    // প্রতি ঘণ্টার নিয়ম যাচাই; গোপন key দিয়ে যাচাই হয়
    pathname === "/api/cron/rules";

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname.startsWith("/login") || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
