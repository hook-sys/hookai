import { CLIENT_ID, CODE_CHALLENGE, redirectAllowed } from "@/lib/mcp/oauth";

export type AuthorizeRequest = { clientId: string; redirectUri: string; challenge: string; state: string };

// অনুমতির পাতার প্যারামিটার যাচাই। ভুল হলে কোথাও redirect না করে পাতাতেই ভুল দেখানো হয়।
export function parseAuthorize(get: (k: string) => string | undefined): AuthorizeRequest | string {
  if (get("response_type") !== "code") return "response_type must be code";
  const clientId = get("client_id") ?? "";
  if (!CLIENT_ID.test(clientId)) return "Unknown client";
  const redirectUri = get("redirect_uri") ?? "";
  if (!redirectAllowed(redirectUri)) return "This app is not allowed to connect";
  const challenge = get("code_challenge") ?? "";
  if (get("code_challenge_method") !== "S256" || !CODE_CHALLENGE.test(challenge)) return "PKCE (S256) is required";
  const state = get("state") ?? "";
  if (state.length > 500) return "state is too long";
  return { clientId, redirectUri, challenge, state };
}
