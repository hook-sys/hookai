// Page Posts ফিচার আপাতত শুধু নির্দিষ্ট অ্যাকাউন্টের জন্য চালু (সার্ভার-সাইড গেট)।
// PAGE_POSTS_ALLOWED_EMAILS-এ কমা দিয়ে আলাদা করা ইমেইল থাকে; না বসালে সবার জন্য বন্ধ।
// এই env শুধু সার্ভারে পড়া হয় (NEXT_PUBLIC_ নয়), ব্রাউজারে কখনো যায় না।

export function pagePostsAllowedEmails(): string[] {
  return (process.env.PAGE_POSTS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function pagePostsAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = pagePostsAllowedEmails();
  return list.length > 0 && list.includes(email.trim().toLowerCase());
}
