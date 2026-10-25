import { redirect } from "next/navigation";
import AuthForm from "@/app/login/AuthForm";
import { SIGNUP_OPEN } from "@/lib/site";

export const metadata = { title: "Create your account" };

// নতুন অ্যাকাউন্ট খোলা বন্ধ থাকলে লগইন পেজে পাঠায়
export default function SignupPage() {
  if (!SIGNUP_OPEN) redirect("/login");
  return <AuthForm initialMode="signup" />;
}
