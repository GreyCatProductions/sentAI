import { search, SearchResult } from "./searchService";
import { extractKeywords } from "./keywordExtractor";
import { callLLM } from "./serverConfig";
import { getPref } from "../utils/prefs";
import type { SearchFilters } from "../types";

const _getPref = getPref as (key: string) => unknown;

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

export async function ask(
  query: string,
  filters: SearchFilters = {},
): Promise<{ answer: string; sources: SearchResult[] }> {
  const searchQuery = await extractKeywords(query);
  const threshold =
    ((_getPref("minSimilarity") as number | undefined) ?? 10) / 100;
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

  const userMessage = `Excerpts from my library:\n\n${context}\n\nQuestion: ${query}`;
  const text = await callLLM(SYSTEM_PROMPT, userMessage);
  return { answer: text || ERROR_TEXT, sources: results };
}
