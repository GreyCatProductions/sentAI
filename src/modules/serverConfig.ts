import { getPref } from "../utils/prefs";

const _getPref = getPref as (key: string) => unknown;

// ── Server URL (embed + health + default chat) ──────────────────────────────

const DEFAULT_SERVER_URL = "http://141.89.241.146";

export function getServerUrl(): string {
  const url = (_getPref("serverUrl") as string | undefined) ?? "";
  return (url || DEFAULT_SERVER_URL).replace(/\/$/, "");
}

// ── LLM config (read fresh on every call) ───────────────────────────────────

export type Provider = "sentai" | "gemini" | "anthropic" | "openai" | "ollama";

export interface LlmConfig {
  provider: Provider;
  endpoint: string;
  apiKey: string;
  model: string;
}

const OLLAMA_URL = "http://localhost:11434";

export function getLlmConfig(): LlmConfig {
  const str = (key: string) => (_getPref(key) as string | undefined) ?? "";

  if (_getPref("useLocalOllama")) {
    return {
      provider: "ollama",
      endpoint: `${OLLAMA_URL}/v1/chat/completions`,
      apiKey: "",
      model: str("localChatModel") || "llama3.1:8b",
    };
  }

  const endpoint = str("llmEndpoint");
  return {
    provider: detectProvider(endpoint),
    endpoint,
    apiKey: str("llmApiKey"),
    model: str("llmModel"),
  };
}

export function detectProvider(endpoint: string): Provider {
  if (!endpoint) return "sentai";
  if (endpoint.includes("generativelanguage.googleapis.com")) return "gemini";
  if (endpoint.includes("anthropic.com")) return "anthropic";
  return "openai";
}

// ── Shared LLM call ──────────────────────────────────────────────────────────

export interface LlmCallOptions {
  maxTokens?: number;
  temperature?: number;
}

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = { candidates?: { content?: { parts?: GeminiPart[] } }[] };
type OpenAIResponse = { choices?: { message?: { content?: string } }[] };
type AnthropicResponse = { content?: { type: string; text?: string }[] };

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options: LlmCallOptions = {},
): Promise<string> {
  const { maxTokens = 2048, temperature = 0.2 } = options;
  const { provider, endpoint, apiKey, model } = getLlmConfig();

  Zotero.log(
    `sentAI: LLM provider="${provider}" endpoint="${endpoint || "(sentai default)"}" model="${model || "(default)"}"`,
  );

  if (provider === "sentai") {
    return callSentaiServer(systemPrompt, userMessage);
  }

  let url: string;
  let body: unknown;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider === "gemini") {
    const key = apiKey || __gemini_api_key__;
    const m = model || "gemini-2.5-flash";
    url = `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${key}`;
    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
        },
      ],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
  } else if (provider === "anthropic") {
    url = endpoint;
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    };
  } else {
    url = endpoint;
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    Zotero.log(`sentAI: LLM HTTP error ${response.status} from ${url}`);
    return "";
  }

  const data = await response.json();

  if (provider === "gemini") {
    const parts: GeminiPart[] =
      (data as GeminiResponse).candidates?.[0]?.content?.parts ?? [];
    return parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
  } else if (provider === "anthropic") {
    return (
      (data as AnthropicResponse).content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? ""
    );
  } else {
    return (data as OpenAIResponse).choices?.[0]?.message?.content ?? "";
  }
}

async function callSentaiServer(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const url = `${getServerUrl()}/chat`;
  Zotero.log(`sentAI: calling sentai server at ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok || !response.body) {
    Zotero.log(`sentAI: sentai server error ${response.status}`);
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.text) result += json.text;
        if (json.error) {
          Zotero.log(`sentAI: sentai server stream error: ${json.error}`);
          return "";
        }
        if (json.done) {
          Zotero.log(
            `sentAI: sentai server stream done (${result.length} chars)`,
          );
          return result;
        }
      } catch {
        //malformed, ignore
      }
    }
  }

  return result;
}
