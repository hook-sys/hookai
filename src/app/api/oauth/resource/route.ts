import { json, MCP_PATH, originOf, preflight, SCOPE } from "@/lib/mcp/oauth";

// Protected Resource Metadata (RFC 9728): MCP সার্ভারের লগইন কোথায়
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = originOf(request);
  return json({
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Hook Ads",
  });
}

export const OPTIONS = preflight;
