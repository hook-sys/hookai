import { json, originOf, preflight, SCOPE } from "@/lib/mcp/oauth";

// OAuth Authorization Server Metadata (RFC 8414); /.well-known/oauth-authorization-server থেকে এখানে আসে
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = originOf(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  });
}

export const OPTIONS = preflight;
