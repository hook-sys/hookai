import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/ai/config";
import { getTr } from "@/lib/i18n-server";
import { PLANS, PLAN_IDS } from "@/lib/plans";
import AppShell from "@/components/AppShell";
import { Badge, Card, Notice, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { setUserPlan } from "./actions";

export const metadata = { title: "Users & plans" };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const tr = await getTr();
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isCurrentUserAdmin(supabase))) notFound();

  const { data } = await supabase.rpc("admin_list_users");
  const users = (data ?? []) as { user_id: string; email: string; plan: string; created_at: string }[];

  return (
    <AppShell active="admin-users">
      <PageHeader
        title={tr("Users & plans", "ইউজার ও প্ল্যান")}
        description={tr(
          "Until payments are switched on, give plans by hand here. Super admins always get Agency limits.",
          "পেমেন্ট চালু হওয়ার আগ পর্যন্ত এখান থেকে হাতে প্ল্যান দাও। সুপার অ্যাডমিন সবসময় Agency-র সীমা পায়।",
        )}
        actions={<Badge>{tr(`${users.length} users`, `${users.length} জন ইউজার`)}</Badge>}
      />
      {status === "saved" && <Notice tone="success">{tr("Plan updated.", "প্ল্যান বদলানো হয়েছে।")}</Notice>}
      {status === "error" && <Notice tone="danger">{tr("Couldn't update the plan.", "প্ল্যান বদলানো যায়নি।")}</Notice>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-5 py-3">{tr("Email", "ইমেইল")}</th>
                <th scope="col" className="px-3 py-3">{tr("Joined", "যোগ দিয়েছে")}</th>
                <th scope="col" className="px-5 py-3">{tr("Plan", "প্ল্যান")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{u.email}</td>
                  <td className="px-3 py-3 text-zinc-500">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-5 py-2">
                    <form action={setUserPlan} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.user_id} />
                      <select
                        name="plan"
                        defaultValue={u.plan}
                        aria-label={tr(`Plan for ${u.email}`, `${u.email}-এর প্ল্যান`)}
                        className={`${inputClass} w-40`}
                      >
                        {PLAN_IDS.map((id) => (
                          <option key={id} value={id}>
                            {PLANS[id].name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={buttonClass("secondary", "px-3 py-1.5")}>
                        {tr("Save", "সংরক্ষণ")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
