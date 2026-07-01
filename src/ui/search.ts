/// <reference lib="dom" />

import { addMessage } from "./messages";
import type { SearchResult } from "../modules/searchService";

type Api = { search: (query: string) => Promise<SearchResult[]> };
const api: Api | undefined = (window as any).arguments?.[0];

export async function onSearch() {
  const input = document.getElementById(
    "sentai-suche-input",
  ) as HTMLInputElement;
  const query = input.value.trim();
  if (!query) return;

  const loadingMsg = addMessage("sentAI", "Searching...");

  try {
    if (!api) throw new Error("sentAI not initialized");
    const results = await api.search(query);

    const senderEl = loadingMsg.previousElementSibling;
    loadingMsg.remove();
    senderEl?.remove();

    if (results.length === 0) {
      addMessage("sentAI", "could not find any suitable results");
      return;
    }

    for (const result of results) {
      const score = (result.similarity * 100).toFixed(1);
      addMessage(
        "sentAI",
        `[${score}%] ${result.title}\n\n${result.chunkText}`,
      );
    }
  } catch (e) {
    console.log(`sentAI: search error - ${(e as Error).message}`);
    loadingMsg.textContent = `Error: ${(e as Error).message}`;
  }
}
