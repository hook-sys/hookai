import AuthForm from "@/app/login/AuthForm";

export const metadata = { title: "Create your account" };

// টেস্টার বা নতুন ব্যবহারকারীকে এই লিংক দিলে সরাসরি অ্যাকাউন্ট খোলার ফর্ম খোলে
export default function SignupPage() {
  return <AuthForm initialMode="signup" />;
}
