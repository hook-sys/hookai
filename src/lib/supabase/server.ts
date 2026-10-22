import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// সার্ভারে (Server Component, Server Action, Route Handler) ব্যবহারের জন্য
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component থেকে cookie লেখা যায় না; middleware session রিফ্রেশ করে
          }
        },
      },
    },
  );
}
