import type { NextConfig } from "next";

// সব পেজে নিরাপত্তা header। পূর্ণ script-src CSP পরে nonce সহ যোগ করা হবে;
// এখানে শুধু সেই নির্দেশনাগুলো যা Next.js-এর স্বাভাবিক কাজ ভাঙে না।
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  // পুরনো ব্রাউজারের জন্য clickjacking সুরক্ষা
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // শুধু HTTPS-এ কার্যকর; localhost-এ ব্রাউজার উপেক্ষা করে
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
