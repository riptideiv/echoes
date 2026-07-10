import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from "./config";

// Simple counter so verification can assert "zero LLM calls on a cached re-run".
let callCount = 0;
export function llmCallCount() {
  return callCount;
}

interface ChatOpts {
  system: string;
  user: string;
  temperature: number;
  /** Ask DeepSeek for a strict JSON object response. */
  json?: boolean;
  maxTokens?: number;
}

/**
 * One chat completion against DeepSeek (OpenAI-compatible). Returns raw string
 * content. Throws on HTTP / network error so the caller can decide to skip.
 */
export async function chat(opts: ChatOpts): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error(
      "DEEPSEEK_API_KEY is missing — set it in .env before generating."
    );
  }
  callCount++;
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? 2048,
      ...(opts.json
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content");
  return content;
}

/** Chat + JSON.parse, tolerant of accidental ```json fences. */
export async function chatJSON<T>(opts: Omit<ChatOpts, "json">): Promise<T> {
  const raw = await chat({ ...opts, json: true });
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
