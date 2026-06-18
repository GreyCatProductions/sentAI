/// <reference lib="dom" />

import { addMessage } from "./ui/messages";
import type { SearchResult } from "./modules/searchService";

type Api = {
  search: (query: string) => Promise<SearchResult[]>;
  ask: (query: string) => Promise<string>;
  getPref: (key: string) => unknown;
  setPref: (key: string, value: unknown) => void;
};

const api: Api | undefined = (window as any).arguments?.[0];

// Send button
const sendButton = document.getElementById("sentai-senden-button") as HTMLButtonElement;
const chatInput = document.getElementById("sentai-eingabe-text") as HTMLTextAreaElement;

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !api) return;

  addMessage("Du", text, true);
  chatInput.value = "";
  sendButton.disabled = true;

  const placeholder = addMessage("sentAI", "...", false);

  try {
    const answer = await api.ask(text);
    placeholder.textContent = answer;
  } catch (e: any) {
    placeholder.textContent = `Error: ${e?.message ?? "Unknown error"}`;
  } finally {
    sendButton.disabled = false;
    const container = document.getElementById("sentai-nachrichten")!;
    container.scrollTop = container.scrollHeight;
  }
}

sendButton.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Settings toggle
const settingsToggle = document.getElementById("sentai-settings-toggle")!;
const settingsDrawer = document.getElementById("sentai-settings")!;
const chunkInput = document.getElementById("sentai-chunk-size") as HTMLInputElement;
const topKInput = document.getElementById("sentai-top-k") as HTMLInputElement;
const autoAttachInput = document.getElementById("sentai-auto-attach-pdf") as HTMLInputElement;

if (api) {
  chunkInput.value = String(api.getPref("maxChunkTokens") ?? 500);
  topKInput.value = String(api.getPref("topK") ?? 5);
  autoAttachInput.checked = Boolean(api.getPref("autoAttachPdf") ?? false);
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

autoAttachInput.addEventListener("change", () => {
  if (api) api.setPref("autoAttachPdf", autoAttachInput.checked);
});
