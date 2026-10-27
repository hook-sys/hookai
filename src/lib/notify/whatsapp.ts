import { decrypt } from "@/lib/crypto";

// WhatsApp-এ অ্যালার্ট পাঠানো। দুই ব্যবস্থা:
// - callmebot: নিজের নম্বরে নিজেকে পাঠানো, একবার অনুমতি দিলেই চলে (ফ্রি, কিন্তু Meta-র নিজের নয়)
// - meta_cloud: Meta-র WhatsApp Cloud API, অনুমোদিত template দিয়ে (অফিশিয়াল)

export type WhatsAppProvider = "callmebot" | "meta_cloud";

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  to: string; // দেশের কোডসহ, শুধু অঙ্ক (যেমন 8801911110476)
  credentialsEncrypted: string;
};

type CallMeBotCreds = { apikey: string };
type MetaCloudCreds = { phone_number_id: string; token: string; template: string; lang: string };

export type AlertLine = { title: string; body?: string | null; severity?: string };

const MAX_LEN = 1000;

export function formatAlerts(lines: AlertLine[]) {
  const head = lines.length === 1 ? "Hook অ্যালার্ট" : `Hook অ্যালার্ট (${lines.length}টি)`;
  const items = lines.map((l) => `• ${l.title}${l.body ? `\n  ${l.body}` : ""}`);
  let text = `${head}\n${items.join("\n")}`;
  if (text.length > MAX_LEN) text = `${text.slice(0, MAX_LEN - 40)}\n… বাকিগুলো Hook-এ দেখো`;
  return text;
}

export async function sendWhatsApp(cfg: WhatsAppConfig, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (cfg.provider === "callmebot") {
      const c = JSON.parse(decrypt(cfg.credentialsEncrypted)) as CallMeBotCreds;
      const url = new URL("https://api.callmebot.com/whatsapp.php");
      url.searchParams.set("phone", `+${cfg.to}`);
      url.searchParams.set("text", text);
      url.searchParams.set("apikey", c.apikey);
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const body = await res.text();
      // সফল হলে উত্তরে "Message queued" লেখা থাকে
      if (!res.ok || !/queued|sent/i.test(body)) {
        return { ok: false, error: `CallMeBot: ${res.status} ${body.replace(/<[^>]+>/g, " ").slice(0, 160)}` };
      }
      return { ok: true };
    }

    const c = JSON.parse(decrypt(cfg.credentialsEncrypted)) as MetaCloudCreds;
    // template-এর ভেতরের লেখায় নতুন লাইন চলে না
    const flat = text.replace(/\s*\n\s*/g, " · ").slice(0, 1000);
    const res = await fetch(`https://graph.facebook.com/v23.0/${c.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cfg.to,
        type: "template",
        template: {
          name: c.template,
          language: { code: c.lang || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: flat }] }],
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) return { ok: false, error: `WhatsApp: ${body?.error?.message ?? res.status}`.slice(0, 200) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "send failed" };
  }
}
