// সাইটের পরিচয় ও আইনি তথ্য এক জায়গায়। যোগাযোগের ইমেইল Vercel/.env-এ
// NEXT_PUBLIC_CONTACT_EMAIL দিয়ে বসাতে হয় (Meta App Review-এ এটি লাগে)।
// নতুন অ্যাকাউন্ট খোলা: এখন শুধু মালিক ব্যবহার করে, তাই বন্ধ। আবার খুলতে Vercel-এ NEXT_PUBLIC_SIGNUP_OPEN=true দাও।
export const SIGNUP_OPEN = process.env.NEXT_PUBLIC_SIGNUP_OPEN === "true";

export const SITE = {
  name: "Hook AI",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  country: "বাংলাদেশ",
  // আইনি পেজের শেষ হালনাগাদের তারিখ; লেখা বদলালে এটিও বদলাতে হবে
  legalUpdated: "23 October 2026",
} as const;
