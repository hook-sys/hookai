import { redirect } from "next/navigation";
import AuthForm from "@/app/login/AuthForm";
import { SIGNUP_OPEN } from "@/lib/site";
import { INVITE_CODE } from "@/lib/invite";

export const metadata = { title: "Create your account" };

type Search = Promise<Record<string, string | string[] | undefined>>;

// নতুন অ্যাকাউন্ট খোলা বন্ধ থাকলে লগইন পেজে পাঠায়; শুধু এককালীন আমন্ত্রণ লিংক থাকলে ফর্ম দেখায়
export default async function SignupPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" && INVITE_CODE.test(sp.invite) ? sp.invite : undefined;
  if (!SIGNUP_OPEN && !invite) redirect("/login");
  return <AuthForm initialMode="signup" invite={invite} />;
}
