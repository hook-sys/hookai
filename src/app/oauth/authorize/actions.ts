"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { newSecret, sha256hex } from "@/lib/mcp/oauth";
import { parseAuthorize } from "./params";

// "Allow" বা "Deny": আবার সব যাচাই করে Claude-এর callback-এ ফেরত পাঠানো
export async function decide(formData: FormData) {
  const req = parseAuthorize((k) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  });
  if (typeof req === "string") throw new Error(req);

  const back = new URL(req.redirectUri);
  if (req.state) back.searchParams.set("state", req.state);

  if (formData.get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }

  const supabase = await createClient();
  const code = newSecret("hko_");
  const { error } = await supabase.rpc("mcp_issue_code", {
    p_code_hash: sha256hex(code),
    p_client_id: req.clientId,
    p_redirect_uri: req.redirectUri,
    p_challenge: req.challenge,
  });
  if (error) {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  back.searchParams.set("code", code);
  redirect(back.toString());
}
