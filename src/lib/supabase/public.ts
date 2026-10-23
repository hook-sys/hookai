import { createClient } from "@supabase/supabase-js";

// লগইন ছাড়া পাবলিক পেজের (ব্লগ) জন্য। cookie পড়ে না, তাই পেজ cache করা যায়।
// RLS অনুযায়ী এটি শুধু প্রকাশিত পোস্টই দেখতে পায়।
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
