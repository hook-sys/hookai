import { redirect } from "next/navigation";

// ক্লায়েন্ট সাজানো এখন সেটিংসের ভেতরে
export default function ClientsPage() {
  redirect("/settings#clients");
}
