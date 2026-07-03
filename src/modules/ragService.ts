import { search, SearchResult } from "./searchService";
import { extractKeywords } from "./keywordExtractor";
import { getPref } from "../utils/prefs";
import type { SearchFilters } from "../types";

const _getPref = getPref as (key: string) => unknown;
const getPrefStr = (key: string) => ((_getPref(key) as string | undefined) ?? "");
const getPrefNum = (key: string, fallback: number) =>
  ((_getPref(key) as number | undefined) ?? fallback);

const SYSTEM_PROMPT = `You are an academic research assistant. Answer the user's question using only the paper excerpts provided below.

Rules:
- Be direct and concise — 3 to 5 sentences per point, no padding
- Cite claims inline with [Paper Title] — only once per sentence, not after every clause
- Use a header only when the answer has 3 or more clearly distinct sections; otherwise plain prose
- No bullet lists unless comparing 3+ discrete items; prefer short paragraphs
- Never restate the question or explain what you are about to do
- Use only content from the provided excerpts
- Always respond in English`;

const ERROR_TEXT =
  "Something went wrong. If you have stable internet connection, the issue is likely on our side. Please try again later.";

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = { candidates?: { content?: { parts?: GeminiPart[] } }[] };
type OpenAIResponse = { choices?: { message?: { content?: string } }[] };
type AnthropicResponse = { content?: { type: string; text?: string }[] };

type Provider = "sentai" | "gemini" | "anthropic" | "openai";

function getLlmConfig(): { endpoint: string; apiKey: string; model: string } {
  return {
    endpoint: getPrefStr("llmEndpoint"),
    apiKey: getPrefStr("llmApiKey"),
    model: getPrefStr("llmModel"),
  };
}

function detectProvider(endpoint: string): Provider {
  if (!endpoint) return "sentai";
  if (endpoint.includes("generativelanguage.googleapis.com")) return "gemini";
  if (endpoint.includes("anthropic.com")) return "anthropic";
  return "openai";
}

async function callSentaiServer(userContent: string): Promise<string> {
  Zotero.log(`sentAI: calling sentai server at ${__server_url__}/chat`);
  const response = await fetch(`${__server_url__}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
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
          Zotero.log(`sentAI: sentai server stream done (${result.length} chars)`);
          return result;
        }
      } catch {
        // malformed line — skip
      }
    }
  }

  return result;
}

async function callLLM(userContent: string): Promise<string> {
  const { endpoint, apiKey, model } = getLlmConfig();
  const provider = detectProvider(endpoint);
  Zotero.log(`sentAI: LLM provider="${provider}" endpoint="${endpoint || "(sentai default)"}" model="${model || "(default)"}"`);

  if (provider === "sentai") return callSentaiServer(userContent);

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
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    };
  } else if (provider === "anthropic") {
    url = endpoint;
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    };
  } else {
    url = endpoint;
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    body = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 2048,
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

export async function ask(
  query: string,
  filters: SearchFilters = {},
): Promise<{ answer: string; sources: SearchResult[] }> {
  const searchQuery = await extractKeywords(query);
  const threshold = getPrefNum("minSimilarity", 10) / 100;
  const allResults = await search(searchQuery, filters);
  const results = allResults.filter((r) => r.similarity >= threshold);

  if (results.length === 0) {
    const answer =
      allResults.length === 0
        ? "No indexed papers found. Please add PDFs to your Zotero library first."
        : `No results above the ${Math.round(threshold * 100)}% similarity threshold. Try lowering "Min. Similarity" in settings or rephrasing your question.`;
    return { answer, sources: [] };
  }

  const context = results
    .map((r) => `[${r.title}]\n${r.chunkText}`)
    .join("\n\n---\n\n");

  const userContent = `Excerpts from my library:\n\n${context}\n\nQuestion: ${query}`;

  const text = await callLLM(userContent);
  return { answer: text || ERROR_TEXT, sources: results };
}
