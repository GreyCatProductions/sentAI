/// <reference lib="dom" />

import { addMessage, updateMessage } from "./ui/messages";
import type { SearchResult } from "./modules/searchService";

type Api = {
  search: (query: string) => Promise<SearchResult[]>;
  ask: (query: string) => Promise<string>;
  getPref: (key: string) => unknown;
  setPref: (key: string, value: unknown) => void;
};

const api: Api | undefined = (window as any).arguments?.[0];

// ===== Tab switching =====
const tabs = document.querySelectorAll<HTMLButtonElement>(".sentai-tab");
const views = document.querySelectorAll<HTMLElement>(".sentai-view");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    views.forEach((v) =>
      v.classList.toggle("active", v.id === `sentai-${tab.dataset.tab}-panel`),
    );
  });
});

// ===== Search tab =====
const searchInput = document.getElementById("sentai-search-input") as HTMLInputElement;
const searchBtn = document.getElementById("sentai-search-btn") as HTMLButtonElement;
const searchResults = document.getElementById("sentai-search-results")!;

function highlightKeywords(text: string, query: string): DocumentFragment {
  const words = query
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const frag = document.createDocumentFragment();
  if (words.length === 0) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }

  const regex = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(regex);

  // split() with a capture group: matched parts appear at odd indices
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (i % 2 === 1) {
      const mark = document.createElement("mark");
      mark.className = "s-highlight";
      mark.textContent = parts[i];
      frag.appendChild(mark);
    } else {
      frag.appendChild(document.createTextNode(parts[i]));
    }
  }
  return frag;
}

function formatAuthors(authors: string | undefined): string | undefined {
  if (!authors) return undefined;
  if (authors.includes(";")) {
    const lastName = authors.split(";")[0].split(",")[0].trim();
    return `${lastName} et al.`;
  }
  return authors;
}

function renderResultCards(results: SearchResult[], query: string) {
  searchResults.innerHTML = "";

  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "s-empty";
    empty.textContent = "No results found. Try a different query or index more PDFs.";
    searchResults.appendChild(empty);
    return;
  }

  results.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "s-result-card";
    card.style.animationDelay = `${i * 40}ms`;

    const row1 = document.createElement("div");
    row1.className = "s-result-row1";

    const title = document.createElement("span");
    title.className = "s-result-title";
    title.textContent = r.title;

    const score = document.createElement("span");
    score.className = "s-result-score";
    score.textContent = `${Math.round(r.similarity * 100)}%`;

    row1.appendChild(title);
    row1.appendChild(score);

    const snippet = document.createElement("div");
    snippet.className = "s-result-snippet";
    snippet.textContent = r.chunkText;

    card.appendChild(row1);
    card.appendChild(snippet);

    const authorDisplay = formatAuthors(r.authors);
    const footerItems = [authorDisplay, r.year, r.journal].filter(Boolean) as string[];

    if (footerItems.length) {
      const footer = document.createElement("div");
      footer.className = "s-result-footer";
      for (const text of footerItems) {
        const chip = document.createElement("span");
        chip.className = "s-chip";
        chip.textContent = text;
        footer.appendChild(chip);
      }
      card.appendChild(footer);
    }

    searchResults.appendChild(card);
  });
}

async function runSearch() {
  const query = searchInput.value.trim();
  if (!query || !api) return;

  searchBtn.disabled = true;
  searchResults.innerHTML = "";
  const loading = document.createElement("div");
  loading.className = "s-empty";
  loading.textContent = "Searching…";
  searchResults.appendChild(loading);

  try {
    const results = await api.search(query);
    renderResultCards(results, query);
  } catch (e: any) {
    searchResults.innerHTML = "";
    const err = document.createElement("div");
    err.className = "s-empty";
    err.textContent = `Error: ${e?.message ?? "Unknown error"}`;
    searchResults.appendChild(err);
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener("click", runSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runSearch();
  }
});

// ===== Chat tab =====
const sendButton = document.getElementById("sentai-senden-button") as HTMLButtonElement;
const chatInput = document.getElementById("sentai-eingabe-text") as HTMLTextAreaElement;

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !api) return;

  addMessage("Du", text, true);
  chatInput.value = "";
  sendButton.disabled = true;

  const placeholder = addMessage("sentAI", "", false);
  placeholder.classList.add("loading");
  [0, 0.16, 0.32].forEach((delay) => {
    const dot = document.createElement("span");
    dot.className = "loading-dot";
    dot.style.animationDelay = `${delay}s`;
    placeholder.appendChild(dot);
  });

  try {
    const answer = await api.ask(text);
    placeholder.classList.remove("loading");
    updateMessage(placeholder, answer);
  } catch (e: any) {
    placeholder.classList.remove("loading");
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

// ===== Settings =====
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
