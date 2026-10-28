import { generateText, type AiConfig } from "@/lib/ai/providers";
import { ACTIONS, READ_TOOLS, ToolError, type AssistantCtx } from "./tools";

// AI সহকারীর লুপ: মডেল JSON-এ বলে কোন "পড়ার" হাতিয়ার চালাতে হবে; ফল দেখে আবার ভাবে।
// শেষে উত্তর দেয়, আর কিছু বদলাতে হলে একটা প্রস্তাব দেয় (মালিক অনুমোদন না দেওয়া পর্যন্ত কিছুই হয় না)।

export type Proposal = { action: string; args: Record<string, unknown>; summary: string };
export type AgentResult = { reply: string; proposal: Proposal | null; costUsd: number | null; steps: string[] };
export type HistoryItem = { role: "user" | "assistant"; content: string };

const MAX_STEPS = 6;
const MAX_TOOL_CHARS = 14_000;

function systemPrompt(ctx: AssistantCtx) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are Hook AI's assistant for a Bangladeshi Meta Ads agency owner. Today is ${today}.
Always reply in Bangla (numbers and names may stay as they are). Be short and practical.

Ad accounts of the current client (use only these):
${ctx.accounts.map((a) => `- ${a.id} ${a.name}${a.id === ctx.selectedAccount ? " (selected)" : ""}`).join("\n") || "- none"}

READ TOOLS (run immediately, you see the result):
${Object.entries(READ_TOOLS).map(([k, v]) => `- ${k}: ${v.desc}`).join("\n")}

ACTIONS (change things on Meta or in Hook; only proposed, the owner approves before they run):
${Object.entries(ACTIONS).map(([k, v]) => `- ${k}: ${v.desc}`).join("\n")}

RULES
- Answer with exactly ONE JSON object and nothing else (no markdown fence).
- To read data: {"tool":{"name":"<read tool>","args":{...}}}
- To answer: {"reply":"<Bangla text>"}
- To answer and propose one change: {"reply":"<Bangla text explaining what will happen>","proposal":{"action":"<action>","args":{...},"summary":"<one Bangla line>"}}
- Never invent numbers, IDs or names. Every ID in a proposal must come from a tool result. Look things up first.
- At most one proposal per answer. Never claim a change is done; say it will happen after approval.
- If something is unclear (which account, which campaign), ask instead of guessing.
- Money is in the account currency shown by the tools. Orders come from the client's store, results from Meta.`;
}

// মডেলের লেখা থেকে প্রথম পূর্ণ JSON অবজেক্ট বের করা
export function parseJson(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```(?:json)?/gi, "");
  const start = clean.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(clean.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function runAgent(cfg: AiConfig, ctx: AssistantCtx, history: HistoryItem[], message: string): Promise<AgentResult> {
  const system = systemPrompt(ctx);
  const transcript = history.map((h) => `${h.role === "user" ? "OWNER" : "ASSISTANT"}: ${h.content}`).join("\n\n");
  const scratch: string[] = [];
  const steps: string[] = [];
  let cost: number | null = null;
  const addCost = (c: number | null) => {
    if (c !== null) cost = (cost ?? 0) + c;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1;
    const prompt = [
      transcript && `CONVERSATION SO FAR:\n${transcript}`,
      `OWNER: ${message}`,
      scratch.length ? `TOOL RESULTS SO FAR:\n${scratch.join("\n\n")}` : "",
      last ? "You must answer now with a reply (no more tools)." : "Respond with one JSON object.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const text = await generateText(cfg, { system, prompt, maxTokens: 6000, onUsage: (u) => addCost(u.costUsd) });
    const out = parseJson(text);
    if (!out) return { reply: text.trim().slice(0, 4000), proposal: null, costUsd: cost, steps };

    const tool = out.tool as { name?: string; args?: Record<string, unknown> } | undefined;
    if (tool?.name && !last) {
      const t = READ_TOOLS[tool.name];
      steps.push(tool.name);
      let result: string;
      if (!t) result = `error: unknown tool ${tool.name}`;
      else {
        try {
          result = JSON.stringify(await t.run(ctx, tool.args ?? {}));
        } catch (err) {
          result = `error: ${err instanceof Error ? err.message.slice(0, 300) : "failed"}`;
        }
      }
      scratch.push(`[${tool.name} ${JSON.stringify(tool.args ?? {})}]\n${result.slice(0, MAX_TOOL_CHARS)}`);
      continue;
    }

    const reply = typeof out.reply === "string" ? out.reply : "";
    const raw = out.proposal as { action?: string; args?: Record<string, unknown>; summary?: string } | undefined;
    if (!raw?.action) return { reply: reply || "…", proposal: null, costUsd: cost, steps };

    // প্রস্তাব আগেই যাচাই: ভুল আইডি বা অন্য অ্যাকাউন্ট হলে মডেলকে জানিয়ে আবার ভাবতে দেওয়া
    const action = ACTIONS[raw.action];
    try {
      if (!action) throw new ToolError(`unknown action ${raw.action}`);
      const args = await action.check(ctx, raw.args ?? {});
      return { reply, proposal: { action: raw.action, args, summary: String(raw.summary ?? "").slice(0, 300) }, costUsd: cost, steps };
    } catch (err) {
      const why = err instanceof Error ? err.message.slice(0, 300) : "invalid";
      if (last) return { reply: `${reply}\n\n(প্রস্তাবটা বানানো গেল না: ${why})`, proposal: null, costUsd: cost, steps };
      scratch.push(`[proposal rejected by validator: ${why}] Fix it or explain to the owner.`);
    }
  }
  return { reply: "উত্তর তৈরি করা গেল না, আবার চেষ্টা করো।", proposal: null, costUsd: cost, steps };
}

export async function executeProposal(ctx: AssistantCtx, p: Proposal) {
  const action = ACTIONS[p.action];
  if (!action) throw new ToolError("unknown action");
  // অনুমোদনের সময় আবার যাচাই (এর মাঝে কিছু বদলে থাকতে পারে)
  const args = await action.check(ctx, p.args);
  return action.run(ctx, args);
}
