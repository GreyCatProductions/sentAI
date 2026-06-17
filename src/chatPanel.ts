/// <reference lib="dom" />

import { addMessage } from "./ui/messages";
import { onSearch } from "./ui/search";
import type { SearchResult } from "./modules/searchService";

type Api = {
  search: (query: string) => Promise<SearchResult[]>;
  getPref: (key: string) => unknown;
  setPref: (key: string, value: unknown) => void;
};

const api: Api | undefined = (window as any).arguments?.[0];

// Search button
document.getElementById("sentai-suche-button")!.addEventListener("click", onSearch);

// Send button
document.getElementById("sentai-senden-button")!.addEventListener("click", () => {
  const input = document.getElementById("sentai-eingabe-text") as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text) return;
  addMessage("Du", text, true);
  input.value = "";
});

// Settings toggle
const settingsToggle = document.getElementById("sentai-settings-toggle")!;
const settingsDrawer = document.getElementById("sentai-settings")!;
const chunkInput = document.getElementById("sentai-chunk-size") as HTMLInputElement;
const topKInput = document.getElementById("sentai-top-k") as HTMLInputElement;

if (api) {
  chunkInput.value = String(api.getPref("maxChunkTokens") ?? 500);
  topKInput.value = String(api.getPref("topK") ?? 5);
}

settingsToggle.addEventListener("click", () => {
  const isOpen = settingsDrawer.classList.toggle("open");
  settingsToggle.classList.toggle("active", isOpen);
});

chunkInput.addEventListener("change", () => {
  const val = parseInt(chunkInput.value, 10);
  if (!isNaN(val) && api) api.setPref("maxChunkTokens", val);
});

topKInput.addEventListener("change", () => {
  const val = parseInt(topKInput.value, 10);
  if (!isNaN(val) && api) api.setPref("topK", val);
});
