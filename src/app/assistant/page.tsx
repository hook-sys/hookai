import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { makeTr } from "@/lib/i18n";
import { getActiveAiConfig, isCurrentUserAdmin } from "@/lib/ai/config";
import { currentClient } from "@/lib/clients";
import AppShell from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import AssistantChat, { type ChatMessage } from "./AssistantChat";

// AI একাধিক ধাপে Meta থেকে পড়ে, তাই সময় বেশি লাগতে পারে
export const maxDuration = 300;

export async function generateMetadata() {
  return { title: makeTr(await getLocale())("AI assistant", "AI সহকারী") };
}

export default async function AssistantPage() {
  const tr = makeTr(await getLocale());
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) notFound();

  const { client } = await currentClient(supabase, user.id);
  let q = supabase
    .from("assistant_messages")
    .select("id, role, content, proposal, proposal_status, result, model, cost_usd, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  q = client ? q.eq("client_id", client.id) : q.is("client_id", null);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: rows }, { data: costs }, model] = await Promise.all([
    q,
    supabase.from("assistant_messages").select("cost_usd").eq("user_id", user.id).gte("created_at", monthStart.toISOString()).not("cost_usd", "is", null),
    getActiveAiConfig(supabase, "assistant").then((c) => c.model).catch(() => null),
  ]);
  const monthCost = (costs ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const messages = ((rows ?? []) as ChatMessage[]).reverse();

  return (
    <AppShell active="assistant">
      <PageHeader
        title={tr("AI assistant", "AI সহকারী")}
        description={tr(
          `${client?.name ?? "—"} · ask for reports or changes; nothing changes on Meta until you approve`,
          `${client?.name ?? "—"} · রিপোর্ট চাও বা কাজ দাও; তুমি অনুমোদন না দিলে Meta-তে কিছুই বদলাবে না`,
        )}
      />
      <AssistantChat messages={messages} model={model} monthCost={monthCost} />
    </AppShell>
  );
}
