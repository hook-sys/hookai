import { redirect } from "next/navigation";

// মূল পেজ থেকে সরাসরি ড্যাশবোর্ডে পাঠায়; middleware লগইন না থাকলে /login-এ নিয়ে যায়
export default function Home() {
  redirect("/dashboard");
}
