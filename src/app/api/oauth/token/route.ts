import { createPublicClient } from "@/lib/supabase/public";
import {
  AUTH_CODE,
  CLIENT_ID,
  CODE_VERIFIER,
  json,
  newSecret,
  preflight,
  readParams,
  redirectAllowed,
  REFRESH_TOKEN,
  s256,
  SCOPE,
  sha256hex,
} from "@/lib/mcp/oauth";

// কোড → টোকেন, আর refresh। access ১ ঘণ্টা, refresh ৩০ দিন (প্রতিবার নতুন)।
export const dynamic = "force-dynamic";

const ACCESS_SECONDS = 3600;
const bad = (error: string, description?: string) => json({ error, ...(description ? { error_description: description } : {}) }, 400);

export async function POST(request: Request) {
  const p = await readParams(request);
  const supabase = createPublicClient();
  const access = newSecret("hka_");
  const refresh = newSecret("hkr_");
  const tokens = () => json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: SCOPE });

  if (!CLIENT_ID.test(p.client_id ?? "")) return bad("invalid_client");

  if (p.grant_type === "authorization_code") {
    if (!AUTH_CODE.test(p.code ?? "") || !redirectAllowed(p.redirect_uri) || !CODE_VERIFIER.test(p.code_verifier ?? "")) {
      return bad("invalid_request");
    }
    const { data, error } = await supabase.rpc("mcp_exchange_code", {
      p_code_hash: sha256hex(p.code),
      p_client_id: p.client_id,
      p_redirect_uri: p.redirect_uri,
      p_challenge_check: s256(p.code_verifier),
      p_access_hash: sha256hex(access),
      p_refresh_hash: sha256hex(refresh),
    });
    if (error || data !== true) return bad("invalid_grant");
    return tokens();
  }

  if (p.grant_type === "refresh_token") {
    if (!REFRESH_TOKEN.test(p.refresh_token ?? "")) return bad("invalid_request");
    const { error } = await supabase.rpc("mcp_refresh", {
      p_refresh_hash: sha256hex(p.refresh_token),
      p_client_id: p.client_id,
      p_access_hash: sha256hex(access),
      p_new_refresh_hash: sha256hex(refresh),
    });
    if (error) return bad("invalid_grant");
    return tokens();
  }

  return bad("unsupported_grant_type");
}

export const OPTIONS = preflight;
