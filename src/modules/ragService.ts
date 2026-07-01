import { search, SearchResult } from "./searchService";
import { extractKeywords } from "./keywordExtractor";
import { getPref } from "../utils/prefs";

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

export async function ask(
  query: string,
): Promise<{ answer: string; sources: SearchResult[] }> {
  const searchQuery = await extractKeywords(query);
  const threshold = ((getPref("minSimilarity") as number) ?? 10) / 100;
  const allResults = await search(searchQuery);
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

  const prompt = `${SYSTEM_PROMPT}\n\nExcerpts from my library:\n\n${context}\n\nQuestion: ${query}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${__gemini_api_key__}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    },
  );

  const rawText = await response.text();

  if (!response.ok) {
    return { answer: ERROR_TEXT, sources: [] };
  }

  const data: GeminiResponse = JSON.parse(rawText);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");

  return { answer: text || ERROR_TEXT, sources: results };
}
