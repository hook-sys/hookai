import Anthropic from "@anthropic-ai/sdk";
import { createFalClient } from "@fal-ai/client";

// সুপার অ্যাডমিন যে প্রোভাইডার চালু করবে, অ্যাপের সব AI কাজ সেটি দিয়েই হবে।
// নতুন প্রোভাইডার যোগ করতে: এখানে একটি এন্ট্রি, generateText-এ একটি case,
// আর ডাটাবেসের check constraint-এ নাম যোগ করতে হবে।
export const AI_PROVIDERS = {
  fal: {
    label: "fal.ai",
    defaultModel: "anthropic/claude-opus-5.5",
    modelHint: "OpenRouter model name, e.g. anthropic/claude-opus-5.5, google/gemini-2.5-flash",
    keyHint: "fal.ai → Dashboard → Keys",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    modelHint: "e.g. gpt-5-mini, gpt-5",
    keyHint: "platform.openai.com → API keys",
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    modelHint: "e.g. gemini-2.5-flash, gemini-2.5-pro",
    keyHint: "aistudio.google.com → Get API key",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    defaultModel: "claude-opus-5-5",
    modelHint: "e.g. claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5",
    keyHint: "platform.claude.com → API keys",
  },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProvider[];

export function isAiProvider(value: string): value is AiProvider {
  return value in AI_PROVIDERS;
}

export type AiConfig = { provider: AiProvider; model: string; apiKey: string };

export type GenerateInput = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

// ব্যবহারকারীকে দেখানো যায় এমন ত্রুটি (কী বা কাঁচা উত্তর এতে থাকে না)
export class AiError extends Error {}

const TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 4000;

// Claude-এর এই মডেলগুলোতে নিরাপত্তা-জনিত refusal হলে Anthropic নিজেই অন্য মডেলে চালায়
const ANTHROPIC_FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiError("The AI provider did not answer in time.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    throw new AiError(`AI provider error: ${message}`);
  }
  return json;
}

async function generateAnthropic(cfg: AiConfig, input: GenerateInput) {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
  });

  const params = {
    model: cfg.model,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: input.system,
    messages: [{ role: "user" as const, content: input.prompt }],
  };

  let response;
  try {
    response = ANTHROPIC_FALLBACK_MODELS.has(cfg.model)
      ? await client.beta.messages.create({
          ...params,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await client.beta.messages.create(params);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiError("The Anthropic API key is not valid.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AiError("Anthropic rate limit reached. Please try again shortly.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new AiError(`Anthropic error (${err.status}): ${err.message}`);
    }
    throw new AiError("Could not reach Anthropic.");
  }

  if (response.stop_reason === "refusal") {
    throw new AiError("Claude declined to answer this request.");
  }

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

async function generateOpenAI(cfg: AiConfig, input: GenerateInput) {
  const json = await postJson(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      max_completion_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    },
  );
  return String(json?.choices?.[0]?.message?.content ?? "");
}

async function generateGemini(cfg: AiConfig, input: GenerateInput) {
  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: { maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS },
    },
  );
  const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

async function generateFal(cfg: AiConfig, input: GenerateInput) {
  const fal = createFalClient({ credentials: cfg.apiKey });
  let result;
  try {
    result = await fal.run("openrouter/router", {
      input: {
        model: cfg.model,
        system_prompt: input.system,
        prompt: input.prompt,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401 || status === 403) {
      throw new AiError("The fal.ai API key is not valid.");
    }
    throw new AiError(
      `fal.ai error: ${err instanceof Error ? err.message : "unknown problem"}`,
    );
  }

  const data = result.data as { output?: string; error?: string };
  if (data.error) throw new AiError(`fal.ai error: ${data.error}`);
  return data.output ?? "";
}

export async function generateText(cfg: AiConfig, input: GenerateInput) {
  let text: string;
  switch (cfg.provider) {
    case "anthropic":
      text = await generateAnthropic(cfg, input);
      break;
    case "openai":
      text = await generateOpenAI(cfg, input);
      break;
    case "gemini":
      text = await generateGemini(cfg, input);
      break;
    case "fal":
      text = await generateFal(cfg, input);
      break;
  }
  if (!text.trim()) throw new AiError("The AI returned an empty answer.");
  return text;
}
