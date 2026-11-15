import { NextResponse } from "next/server";

// লগইন না থাকলে: অনুমতির পাতার ঠিকানা মনে রেখে লগইনে পাঠানো; লগইনের পর সেখানেই ফেরে
export function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "";
  const response = NextResponse.redirect(`${url.origin}/login`);
  if (next.startsWith("/oauth/authorize?") && next.length < 2000) {
    response.cookies.set("oauth_return", next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }
  return response;
}
