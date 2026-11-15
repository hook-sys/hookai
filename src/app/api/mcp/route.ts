import { decrypt } from "@/lib/crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { ACCESS_TOKEN, json, preflight, resourceMetadataUrl, sha256hex } from "@/lib/mcp/oauth";
import { TOOLS, ToolError, writeLog, type ClientRow, type Ctx } from "@/lib/mcp/tools";
import { MetaApiError } from "@/lib/meta/graph";
import { UnsafeUrlError } from "@/lib/mcp/safeFetch";

// Claude-এর কাস্টম কানেক্টর (MCP, Streamable HTTP)। প্রতিটা অনুরোধ আলাদা (stateless), উত্তর JSON-এ।
// লগইন: নিজস্ব OAuth টোকেন (Authorization: Bearer)। টোকেন না থাকলে 401, তখন Claude লগইন শুরু করে।
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Hook runs Meta (Facebook/Instagram) ads for the user's clients.
- Always name the client (see list_clients). Every action is checked against that client's ad accounts.
- Everything new (campaigns, ad sets, ads, copies) is created PAUSED.
- Turning something on, or raising a budget, first returns a preview with a confirm_code. Show the preview to the user and only call again with the confirm_code after the user clearly says yes. Never confirm on your own.
- Pausing and lowering budgets apply at once.
- Defaults: broad audience, age 25-45, major Bangladesh cities, Advantage+ placements, the client's page, pixel and website.
- Typical flow: list_clients → upload_creative → launch_ad (paused) → show the user → set_status ACTIVE (preview, then confirm).`;

type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcError = (id: RpcMsg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function unauthorized(request: Request) {
  return json(rpcError(null, -32001, "Unauthorized"), 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(request)}"`,
  });
}

async function callTool(ctx: Ctx, params: Record<string, unknown> | undefined) {
  const name = typeof params?.name === "string" ? params.name : "";
  const args = (params?.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  try {
    const out = await tool.run(ctx, args);
    if (tool.write && out.log) await writeLog(ctx, tool.name, true, out.log, undefined, args);
    return { content: [{ type: "text", text: JSON.stringify(out.result, null, 1) }], isError: false };
  } catch (e) {
    const known = e instanceof ToolError || e instanceof MetaApiError || e instanceof UnsafeUrlError;
    const message = known ? (e as Error).message : "Something went wrong on the server. Please try again.";
    if (!known) console.error("mcp tool failed", name, e);
    if (tool.write) await writeLog(ctx, tool.name, false, undefined, message, args);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

async function handle(ctx: Ctx, msg: RpcMsg) {
  const p = msg.params;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof p?.protocolVersion === "string" ? p.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "hook-ads", title: "Hook Ads", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id: msg.id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { title: t.title, readOnlyHint: !t.write, destructiveHint: !!t.destructive, idempotentHint: !t.write, openWorldHint: true },
          })),
        },
      };
    case "tools/call": {
      const result = await callTool(ctx, p);
      return result ? { jsonrpc: "2.0", id: msg.id, result } : rpcError(msg.id, -32602, "Unknown tool");
    }
    default:
      return rpcError(msg.id, -32601, "Method not found");
  }
}

export async function POST(request: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m || !ACCESS_TOKEN.test(m[1])) return unauthorized(request);

  const supabase = createPublicClient();
  const accessHash = sha256hex(m[1]);
  const { data, error } = await supabase.rpc("mcp_context", { p_access_hash: accessHash });
  if (error || !data) return unauthorized(request);

  const d = data as { user_id: string; via: string; token: string | null; clients: ClientRow[] };
  const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
  let metaToken: string | null = systemToken || null;
  if (!metaToken && d.token) {
    try {
      metaToken = decrypt(d.token);
    } catch {
      metaToken = null;
    }
  }
  const ctx: Ctx = {
    supabase,
    accessHash,
    userId: d.user_id,
    via: d.via,
    metaToken,
    tokenSource: systemToken ? "system_user" : metaToken ? "owner_login" : "none",
    clients: (d.clients ?? []).map((c) => ({ ...c, profile: c.profile ?? {}, accounts: c.accounts ?? [] })),
  };

  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, 1_000_000));
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as RpcMsg[];
  const replies = [];
  for (const msg of msgs.slice(0, 20)) {
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      replies.push(rpcError(msg?.id, -32600, "Invalid Request"));
      continue;
    }
    // notification (id নেই): উত্তর লাগে না
    if (msg.id === undefined || msg.id === null) continue;
    replies.push(await handle(ctx, msg));
  }
  if (!replies.length) return new Response(null, { status: 202, headers: { "Access-Control-Allow-Origin": "*" } });
  return json(batch ? replies : replies[0]);
}

// এই সার্ভার SSE stream খোলে না
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });
}

export const OPTIONS = preflight;
