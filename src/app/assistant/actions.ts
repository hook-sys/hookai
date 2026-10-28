"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getTr } from "@/lib/i18n-server";
import { getActiveAiConfig, isCurrentUserAdmin } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/providers";
import { currentClient } from "@/lib/clients";
import { executeProposal, runAgent, type Proposal } from "@/lib/assistant/agent";
import type { AssistantCtx } from "@/lib/assistant/tools";

export type AssistantState = { ok: true } | { ok: false; error: string } | null;

const HISTORY = 12;

async function context() {
  const tr = await getTr();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserAdmin(supabase))) return { error: tr("Only the owner can use the assistant.", "শুধু মালিক সহকারী ব্যবহার করতে পারে।") } as const;
  const [{ data: c }, { client, clients, accounts }] = await Promise.all([
    supabase.from("meta_connections").select("access_token_encrypted, selected_ad_account_id, selected_ad_account_name").eq("user_id", user.id).maybeSingle(),
    currentClient(supabase, user.id),
  ]);
  if (!c?.access_token_encrypted) return { error: tr("Connect Meta first.", "আগে Meta সংযোগ করো।") } as const;
  // ক্লায়েন্ট থাকলে শুধু তার অ্যাকাউন্টগুলো; না থাকলে বেছে রাখা অ্যাকাউন্ট
  const list =
    clients.length > 0 && client
      ? accounts.filter((a) => a.client_id === client.id).map((a) => ({ id: a.ad_account_id, name: a.ad_account_name ?? a.ad_account_id }))
      : c.selected_ad_account_id
        ? [{ id: c.selected_ad_account_id, name: c.selected_ad_account_name ?? c.selected_ad_account_id }]
        : [];
  if (list.length === 0) return { error: tr("This client has no ad account yet.", "এই ক্লায়েন্টের কোনো Ad Account নেই।") } as const;
  const selected = list.some((a) => a.id === c.selected_ad_account_id) ? (c.selected_ad_account_id as string) : list[0].id;
  const ctx: AssistantCtx = {
    supabase,
    userId: user.id,
    clientId: client?.id ?? null,
    token: decrypt(c.access_token_encrypted),
    selectedAccount: selected,
    accounts: list,
  };
  return { tr, ctx };
}

export async function sendMessage(_prev: AssistantState, formData: FormData): Promise<AssistantState> {
  const got = await context();
  if ("error" in got) return { ok: false, error: got.error ?? "" };
  const { tr, ctx } = got;
  const text = String(formData.get("message") ?? "").trim().slice(0, 4000);
  if (!text) return { ok: false, error: tr("Write something first.", "আগে কিছু লেখো।") };

  let q = ctx.supabase.from("assistant_messages").select("role, content, proposal, proposal_status, result").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(HISTORY);
  q = ctx.clientId ? q.eq("client_id", ctx.clientId) : q.is("client_id", null);
  const { data: past } = await q;
  // আগের প্রস্তাবের ফলও ইতিহাসে, যাতে মডেল জানে কী হয়েছে
  const history = (past ?? []).reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content:
      m.content +
      (m.proposal ? `\n[proposal ${(m.proposal as Proposal).action}: ${m.proposal_status}${m.result ? ` — ${m.result}` : ""}]` : ""),
  }));

  // পুরোনো অপেক্ষমাণ প্রস্তাব নতুন প্রশ্নের পর বাতিল ধরা হয়
  await ctx.supabase.from("assistant_messages").update({ proposal_status: "rejected" }).eq("user_id", ctx.userId).eq("proposal_status", "pending");
  await ctx.supabase.from("assistant_messages").insert({ user_id: ctx.userId, client_id: ctx.clientId, ad_account_id: ctx.selectedAccount, role: "user", content: text });

  let cfg;
  try {
    cfg = await getActiveAiConfig(ctx.supabase, "assistant");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI" };
  }
  try {
    const r = await runAgent(cfg, ctx, history, text);
    await ctx.supabase.from("assistant_messages").insert({
      user_id: ctx.userId,
      client_id: ctx.clientId,
      ad_account_id: ctx.selectedAccount,
      role: "assistant",
      content: (r.reply || "…").slice(0, 20000),
      proposal: r.proposal,
      proposal_status: r.proposal ? "pending" : null,
      model: cfg.model,
      cost_usd: r.costUsd,
    });
  } catch (err) {
    const msg = err instanceof AiError || err instanceof Error ? err.message.slice(0, 300) : "error";
    return { ok: false, error: tr(`The AI could not answer: ${msg}`, `AI উত্তর দিতে পারেনি: ${msg}`) };
  }
  revalidatePath("/assistant");
  return { ok: true };
}

export async function approveProposal(id: string): Promise<AssistantState> {
  const got = await context();
  if ("error" in got) return { ok: false, error: got.error ?? "" };
  const { tr, ctx } = got;
  // একবারই চলবে: pending থেকে approved করতে পারলে তবেই
  const { data: row } = await ctx.supabase
    .from("assistant_messages")
    .update({ proposal_status: "approved" })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("proposal_status", "pending")
    .select("proposal")
    .maybeSingle();
  if (!row?.proposal) return { ok: false, error: tr("This proposal is no longer waiting.", "এই প্রস্তাবটা আর অপেক্ষায় নেই।") };
  try {
    const result = await executeProposal(ctx, row.proposal as Proposal);
    await ctx.supabase.from("assistant_messages").update({ proposal_status: "done", result: result.slice(0, 1000) }).eq("id", id);
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 500) : "error";
    await ctx.supabase.from("assistant_messages").update({ proposal_status: "failed", result: msg }).eq("id", id);
  }
  revalidatePath("/assistant");
  return { ok: true };
}

export async function rejectProposal(id: string): Promise<AssistantState> {
  const got = await context();
  if ("error" in got) return { ok: false, error: got.error ?? "" };
  await got.ctx.supabase.from("assistant_messages").update({ proposal_status: "rejected" }).eq("id", id).eq("user_id", got.ctx.userId).eq("proposal_status", "pending");
  revalidatePath("/assistant");
  return { ok: true };
}

export async function clearChat(): Promise<AssistantState> {
  const got = await context();
  if ("error" in got) return { ok: false, error: got.error ?? "" };
  let q = got.ctx.supabase.from("assistant_messages").delete().eq("user_id", got.ctx.userId);
  q = got.ctx.clientId ? q.eq("client_id", got.ctx.clientId) : q.is("client_id", null);
  await q;
  revalidatePath("/assistant");
  return { ok: true };
}
