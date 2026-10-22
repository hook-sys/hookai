import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getMeta,
} from "@/lib/meta/graph";

// Meta থেকে ফেরত আসা কোড নিয়ে টোকেন বানিয়ে এনক্রিপ্ট করে সংরক্ষণ করে
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  // state কুকি একবারই ব্যবহারযোগ্য: সফল বা ব্যর্থ, সব ক্ষেত্রেই মুছে ফেলা হয়।
  // connect রুটে যে path দিয়ে সেট হয়েছে, মোছার সময়ও একই path দিতে হবে।
  const dashboard = (result: string) => {
    const response = NextResponse.redirect(`${origin}/settings?meta=${result}`);
    response.cookies.delete({ name: "meta_oauth_state", path: "/api/meta" });
    return response;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // ব্যবহারকারী অনুমতি না দিলে
  if (searchParams.get("error")) {
    return dashboard("denied");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("meta_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return dashboard("invalid");
  }

  try {
    const short = await exchangeCodeForToken(code);
    const long = await exchangeForLongLivedToken(short.access_token);
    const me = await getMeta(long.access_token);

    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("meta_connections").upsert(
      {
        user_id: user.id,
        meta_user_id: me.id,
        meta_user_name: me.name,
        access_token_encrypted: encrypt(long.access_token),
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("meta_connections upsert failed", error.message);
      return dashboard("error");
    }
  } catch (err) {
    console.error("meta oauth failed", err instanceof Error ? err.message : err);
    return dashboard("error");
  }

  return dashboard("connected");
}
