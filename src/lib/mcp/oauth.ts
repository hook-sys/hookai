import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

// Claude-এর কাস্টম কানেক্টরের জন্য নিজস্ব OAuth। টোকেন কখনো ডাটাবেসে সরাসরি থাকে না, শুধু sha256।

export const MCP_PATH = "/api/mcp";
export const SCOPE = "ads";

export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
// PKCE S256: base64url(sha256(verifier))
export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const newSecret = (prefix: string) => prefix + randomBytes(32).toString("base64url");

export const ACCESS_TOKEN = /^hka_[A-Za-z0-9_-]{43}$/;
export const REFRESH_TOKEN = /^hkr_[A-Za-z0-9_-]{43}$/;
export const AUTH_CODE = /^hko_[A-Za-z0-9_-]{43}$/;
export const CLIENT_ID = /^hkc_[A-Za-z0-9_-]{20,64}$/;
export const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

// শুধু Claude-এর নিজের callback (আর পরীক্ষার জন্য নিজের কম্পিউটারের localhost) চলবে
const REDIRECT_OK = /^(https:\/\/(claude\.ai|claude\.com)\/api\/mcp\/auth_callback|http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/callback)$/;
export const redirectAllowed = (u: unknown): u is string => typeof u === "string" && REDIRECT_OK.test(u);

export const originOf = (request: Request) => new URL(request.url).origin;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function resourceMetadataUrl(request: Request) {
  return `${originOf(request)}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

// application/x-www-form-urlencoded (নিয়ম অনুযায়ী) অথবা JSON
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const text = (await request.text()).slice(0, 10_000);
  if (type.includes("application/json")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}
