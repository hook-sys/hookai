import { randomBytes } from "node:crypto";
import { createPublicClient } from "@/lib/supabase/public";
import { json, preflight, redirectAllowed } from "@/lib/mcp/oauth";

// Dynamic Client Registration (RFC 7591): Claude নিজে নিবন্ধন করে। শুধু Claude-এর callback চলে।
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, 400);
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) {
    return json({ error: "invalid_redirect_uri", error_description: "Only Claude's callback is allowed" }, 400);
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "MCP client";
  const clientId = `hkc_${randomBytes(24).toString("base64url")}`;

  const { error } = await createPublicClient().rpc("mcp_register_client", { p_client_id: clientId, p_name: name, p_redirects: uris });
  if (error) {
    return json({ error: "invalid_client_metadata", error_description: "Registration refused" }, 400);
  }
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export const OPTIONS = preflight;
