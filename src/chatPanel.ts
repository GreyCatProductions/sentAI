/// <reference lib="dom" />

import { addMessage, updateMessage } from "./ui/messages";
import type { SearchResult } from "./modules/searchService";
import type { SearchFilters } from "./types";
import type { SkillDef } from "./modules/skillsLoader";

type Api = {
  search: (query: string, filters?: SearchFilters) => Promise<SearchResult[]>;
  ask: (query: string, filters?: SearchFilters) => Promise<{ answer: string; sources: SearchResult[] }>;
  getPref: (key: string) => unknown;
  setPref: (key: string, value: unknown) => void;
  getCollections: () => { id: number; name: string }[];
  getTags: () => Promise<string[]>;
  getSkills: () => Promise<SkillDef[]>;
  openSkillsFolder: () => void;
  healthCheck: () => Promise<{ embedder: boolean; hasIndex: boolean }>;
  openItem: (itemId: number) => void;
  getIndexStats: () => Promise<{ itemCount: number; chunkCount: number; sizeBytes: number }>;
  reindexAll: (onProgress?: (done: number, total: number, title: string, totalChunks: number) => void) => Promise<void>;
  reindexCollection: (collectionId: number, onProgress?: (done: number, total: number, title: string, totalChunks: number) => void) => Promise<void>;
  deleteIndex: (collectionId?: number) => Promise<void>;
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

// ===== Health check =====
const statusOverlay = document.getElementById("sentai-status-overlay")!;
const statusMessage = document.getElementById("sentai-status-message")!;
const retryBtn = document.getElementById(
  "sentai-retry-btn",
) as HTMLButtonElement;
const chatTab = document.querySelector<HTMLButtonElement>('[data-tab="chat"]')!;

function setChatTabEnabled(enabled: boolean) {
  chatTab.disabled = !enabled;
  chatTab.classList.toggle("disabled", !enabled);
  chatTab.title = enabled ? "" : "Embedding server not reachable";
}

function showViews() {
  statusOverlay.classList.remove("active");
}

function showError(msg: string) {
  statusMessage.textContent = msg;
  // Deactivate all real views, activate overlay
  views.forEach((v) => v.classList.remove("active"));
  tabs.forEach((t) => t.classList.remove("active"));
  statusOverlay.classList.add("active");
}

async function runHealthCheck(autoRetry = true) {
  retryBtn.disabled = true;
  statusMessage.textContent = "Checking connection…";
  statusOverlay.classList.add("active");
  views.forEach((v) => v.classList.remove("active"));

  if (!api || typeof (api as any).healthCheck !== "function") {
    if (autoRetry) {
      setTimeout(() => runHealthCheck(true), 1500);
      return;
    }
    setChatTabEnabled(false);
    showError("Plugin not initialized.");
    retryBtn.disabled = false;
    return;
  }

  let embedder = false;
  let hasIndex = false;
  try {
    ({ embedder, hasIndex } = await api.healthCheck());
  } catch {
    // treat as not reachable
  }

  if (!embedder && autoRetry) {
    let attempts = 0;
    const maxAttempts = 8;
    const retry = async () => {
      attempts++;
      statusMessage.textContent = `Checking connection… (${attempts}/${maxAttempts})`;
      try {
        const result = await api!.healthCheck();
        if (result.embedder) {
          finishHealthCheck(result.embedder, result.hasIndex);
          return;
        }
      } catch {
        // keep retrying
      }
      if (attempts < maxAttempts) {
        setTimeout(retry, 1500);
      } else {
        setChatTabEnabled(false);
        showError(
          "Embedding server not reachable.\nMake sure the server is running.",
        );
        retryBtn.disabled = false;
      }
    };
    setTimeout(retry, 1500);
    return;
  }

  finishHealthCheck(embedder, hasIndex);
}

function finishHealthCheck(embedder: boolean, hasIndex: boolean) {
  setChatTabEnabled(embedder);

  if (!embedder) {
    showError(
      "Embedding server not reachable.\nMake sure the server is running.",
    );
    retryBtn.disabled = false;
    return;
  }

  if (!hasIndex) {
    showError(
      "No papers indexed yet.\nAdd PDFs to your Zotero library to get started.",
    );
    retryBtn.disabled = false;
    return;
  }

  // All good — activate first tab, hide overlay
  showViews();
  tabs[0]?.classList.add("active");
  views.forEach((v) =>
    v.classList.toggle("active", v.id === "sentai-search-panel"),
  );
  retryBtn.disabled = false;
}

retryBtn.addEventListener("click", () => runHealthCheck());
runHealthCheck();

// ===== Search tab =====
const searchInput = document.getElementById(
  "sentai-search-input",
) as HTMLInputElement;
const searchBtn = document.getElementById(
  "sentai-search-btn",
) as HTMLButtonElement;
const searchResults = document.getElementById("sentai-search-results")!;

// Collection dropdown (custom — native <select> renders ghost labels in Gecko)
// ── Shared collection state ──────────────────────────────────────────────────
let selectedCollectionId: number | undefined = undefined;

interface ColBar {
  btn: HTMLElement;
  label: HTMLElement;
  dropdown: HTMLElement;
}

const searchColBar: ColBar = {
  btn: document.getElementById("sentai-collection-btn")!,
  label: document.getElementById("sentai-collection-label")!,
  dropdown: document.getElementById("sentai-collection-dropdown")!,
};

const chatColBar: ColBar = {
  btn: document.getElementById("sentai-chat-collection-btn")!,
  label: document.getElementById("sentai-chat-collection-label")!,
  dropdown: document.getElementById("sentai-chat-collection-dropdown")!,
};

function setCollection(id: number | undefined, name: string) {
  selectedCollectionId = id;
  [searchColBar, chatColBar].forEach((bar) => {
    bar.label.textContent = name;
    bar.dropdown.querySelectorAll(".s-col-option").forEach((o) => {
      o.classList.toggle("selected", (o as HTMLElement).dataset.id === String(id ?? ""));
    });
    bar.dropdown.classList.remove("open");
    bar.btn.classList.remove("open");
  });
}

function buildCollectionOption(
  id: number | undefined,
  name: string,
  active: boolean,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "s-col-option" + (active ? " selected" : "");
  el.textContent = name;
  el.dataset.id = String(id ?? "");
  el.addEventListener("click", () => setCollection(id, name));
  return el;
}

function populateColBar(bar: ColBar) {
  bar.dropdown.appendChild(buildCollectionOption(undefined, "All Collections", true));
  if (api) {
    for (const col of api.getCollections()) {
      bar.dropdown.appendChild(buildCollectionOption(col.id, col.name, false));
    }
  }
  bar.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = bar.dropdown.classList.toggle("open");
    bar.btn.classList.toggle("open", isOpen);
  });
}

populateColBar(searchColBar);
populateColBar(chatColBar);

document.addEventListener("click", () => {
  [searchColBar, chatColBar].forEach((bar) => {
    bar.dropdown.classList.remove("open");
    bar.btn.classList.remove("open");
  });
  closeReindexDropdown();
});

// ===== Filter bar =====
const filterToggle = document.getElementById(
  "sentai-filter-toggle",
) as HTMLButtonElement;
const filterPanel = document.getElementById("sentai-filter-panel")!;
const filterCountBadge = document.getElementById("sentai-filter-count")!;
const tagChipsContainer = document.getElementById("sentai-tag-chips")!;
const tagInput = document.getElementById(
  "sentai-tag-input",
) as HTMLInputElement;
const tagDatalist = document.getElementById("sentai-tag-datalist")!;
const yearFromInput = document.getElementById(
  "sentai-year-from",
) as HTMLInputElement;
const yearToInput = document.getElementById(
  "sentai-year-to",
) as HTMLInputElement;
const itemTypeBtn = document.getElementById(
  "sentai-item-type-btn",
) as HTMLButtonElement;
const itemTypeBtnLabel = document.getElementById("sentai-item-type-label")!;
const itemTypeDropdown = document.getElementById("sentai-item-type-dropdown")!;

let selectedTags: string[] = [];
let selectedItemType = "";

const ITEM_TYPES: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "journalArticle", label: "Journal Article" },
  { value: "book", label: "Book" },
  { value: "bookSection", label: "Book Chapter" },
  { value: "thesis", label: "Thesis" },
  { value: "conferencePaper", label: "Conference Paper" },
  { value: "preprint", label: "Preprint" },
  { value: "report", label: "Report" },
];

function buildTypeOption(
  value: string,
  label: string,
  active: boolean,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "s-type-option" + (active ? " selected" : "");
  el.textContent = label;
  el.addEventListener("click", () => {
    selectedItemType = value;
    itemTypeBtnLabel.textContent = label;
    itemTypeDropdown
      .querySelectorAll(".s-type-option")
      .forEach((o) => o.classList.remove("selected"));
    el.classList.add("selected");
    itemTypeDropdown.classList.remove("open");
    itemTypeBtn.classList.remove("open");
    updateFilterCount();
  });
  return el;
}

for (const { value, label } of ITEM_TYPES) {
  itemTypeDropdown.appendChild(buildTypeOption(value, label, value === ""));
}

itemTypeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = itemTypeDropdown.classList.toggle("open");
  itemTypeBtn.classList.toggle("open", isOpen);
});

document.addEventListener("click", () => {
  itemTypeDropdown.classList.remove("open");
  itemTypeBtn.classList.remove("open");
});

function updateFilterCount() {
  const yearFrom = yearFromInput.value.trim();
  const yearTo = yearToInput.value.trim();
  const count =
    selectedTags.length +
    (yearFrom || yearTo ? 1 : 0) +
    (selectedItemType ? 1 : 0);
  filterCountBadge.textContent = String(count);
  (filterCountBadge as HTMLElement).hidden = count === 0;
}

function addTagChip(tag: string) {
  if (!tag || selectedTags.includes(tag)) return;
  selectedTags.push(tag);

  const chip = document.createElement("span");
  chip.className = "s-tag-chip";
  chip.textContent = tag;

  const removeBtn = document.createElement("button");
  removeBtn.className = "s-tag-chip-remove";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", () => {
    selectedTags = selectedTags.filter((t) => t !== tag);
    chip.remove();
    updateFilterCount();
  });

  chip.appendChild(removeBtn);
  tagChipsContainer.appendChild(chip);
  updateFilterCount();
}

tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const val = tagInput.value.trim();
    if (val) {
      addTagChip(val);
      tagInput.value = "";
    }
  }
});

tagInput.addEventListener("change", () => {
  const val = tagInput.value.trim();
  if (val) {
    addTagChip(val);
    tagInput.value = "";
  }
});

yearFromInput.addEventListener("change", updateFilterCount);
yearToInput.addEventListener("change", updateFilterCount);

filterToggle.addEventListener("click", () => {
  const isOpen = filterPanel.classList.toggle("open");
  filterToggle.classList.toggle("open", isOpen);
});

if (api) {
  api.getTags().then((tags) => {
    for (const tag of tags) {
      const option = document.createElement("option");
      option.value = tag;
      tagDatalist.appendChild(option);
    }
  });
}

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
    empty.textContent =
      "No results found. Try a different query or index more PDFs.";
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

    if (r.itemId != null && api) {
      const jumpBtn = document.createElement("button");
      jumpBtn.className = "s-jump-btn";
      jumpBtn.title = "Show in Zotero";
      jumpBtn.textContent = "↗";
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        api.openItem(r.itemId!);
      });
      row1.appendChild(jumpBtn);
    }

    const snippet = document.createElement("div");
    snippet.className = "s-result-snippet";
    snippet.textContent = r.chunkText;

    card.appendChild(row1);
    card.appendChild(snippet);

    const authorDisplay = formatAuthors(r.authors);
    const footerItems = [authorDisplay, r.year, r.journal].filter(
      Boolean,
    ) as string[];

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
    const yearFrom = yearFromInput.value.trim()
      ? parseInt(yearFromInput.value.trim(), 10)
      : undefined;
    const yearTo = yearToInput.value.trim()
      ? parseInt(yearToInput.value.trim(), 10)
      : undefined;
    const itemType = selectedItemType || undefined;

    const filters: SearchFilters = {
      collectionId: selectedCollectionId,
      tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
      yearFrom,
      yearTo,
      itemType,
    };

    const results = await api.search(query, filters);
    const threshold = ((api.getPref("minSimilarity") as number) ?? 10) / 100;
    const filtered = results.filter((r) => r.similarity >= threshold);
    renderResultCards(filtered, query);
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
const sendButton = document.getElementById(
  "sentai-senden-button",
) as HTMLButtonElement;
const chatInput = document.getElementById(
  "sentai-eingabe-text",
) as HTMLTextAreaElement;

function wireCitations(msgEl: HTMLElement, sources: SearchResult[]) {
  if (!api || sources.length === 0) return;
  const titleMap = new Map<string, number>();
  for (const s of sources) {
    if (s.itemId != null) {
      titleMap.set(s.title.toLowerCase().trim(), s.itemId);
    }
  }
  msgEl.querySelectorAll<HTMLElement>(".s-cite").forEach((cite) => {
    const raw = cite.textContent ?? "";
    const title = raw
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .toLowerCase()
      .trim();
    const itemId = titleMap.get(title);
    if (itemId != null) {
      cite.classList.add("clickable");
      cite.title = "Show in Zotero";
      cite.addEventListener("click", () => api!.openItem(itemId));
    }
  });
}

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
    const { answer, sources } = await api.ask(text, { collectionId: selectedCollectionId });
    placeholder.classList.remove("loading");
    updateMessage(placeholder, answer);
    wireCitations(placeholder, sources);

    const uniquePapers = new Set(sources.map((s) => s.title)).size;
    const ragInfo = document.createElement("div");
    ragInfo.className = "s-rag-info";
    ragInfo.textContent = `${sources.length} chunk${sources.length !== 1 ? "s" : ""} · ${uniquePapers} paper${uniquePapers !== 1 ? "s" : ""}`;
    placeholder.insertAdjacentElement("afterend", ragInfo);
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
const chunkInput = document.getElementById(
  "sentai-chunk-size",
) as HTMLInputElement;
const topKInput = document.getElementById("sentai-top-k") as HTMLInputElement;
const autoAttachInput = document.getElementById(
  "sentai-auto-attach-pdf",
) as HTMLInputElement;
const minSimilarityInput = document.getElementById(
  "sentai-min-similarity",
) as HTMLInputElement;
const llmApiKeyInput = document.getElementById(
  "sentai-llm-api-key",
) as HTMLInputElement;
const llmEndpointInput = document.getElementById(
  "sentai-llm-endpoint",
) as HTMLInputElement;
const llmModelInput = document.getElementById(
  "sentai-llm-model",
) as HTMLInputElement;

if (api) {
  chunkInput.value = String(api.getPref("maxChunkTokens") ?? 500);
  topKInput.value = String(api.getPref("topK") ?? 5);
  autoAttachInput.checked = Boolean(api.getPref("autoAttachPdf") ?? false);
  minSimilarityInput.value = String(api.getPref("minSimilarity") ?? 10);
  llmApiKeyInput.value = String(api.getPref("llmApiKey") ?? "");
  llmEndpointInput.value = String(api.getPref("llmEndpoint") ?? "");
  llmModelInput.value = String(api.getPref("llmModel") ?? "");
}

// ── Settings drawer inner tabs ───────────────────────────────────────────────
const settingsTabs = document.querySelectorAll<HTMLButtonElement>(".sentai-settings-tab");
const infoPanel = document.getElementById("info-panel")!;
const settingsPanel = document.getElementById("settings-panel")!;
const infoCountEl = document.getElementById("sentai-info-count")!;
const infoChunksEl = document.getElementById("sentai-info-chunks")!;
const infoSizeEl = document.getElementById("sentai-info-size")!;
const reindexStatus = document.getElementById("sentai-reindex-status")!;
const reindexColBtn = document.getElementById("sentai-reindex-collection-btn")!;
const reindexColLabel = document.getElementById("sentai-reindex-collection-label")!;
const reindexColDropdown = document.getElementById("sentai-reindex-collection-dropdown")!;
const reindexColRun = document.getElementById("sentai-reindex-collection-run") as HTMLButtonElement;
const reindexAllBtn = document.getElementById("sentai-reindex-all") as HTMLButtonElement;
const deleteIndexBtn = document.getElementById("sentai-delete-index") as HTMLButtonElement;

let reindexCollectionId: number | undefined = undefined;

function buildReindexColOption(id: number | undefined, name: string, active: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = "s-col-option" + (active ? " selected" : "");
  el.textContent = name;
  el.dataset.id = String(id ?? "");
  el.addEventListener("click", () => {
    reindexCollectionId = id;
    reindexColLabel.textContent = name;
    reindexColDropdown.querySelectorAll(".s-col-option").forEach((o) =>
      o.classList.toggle("selected", (o as HTMLElement).dataset.id === String(id ?? "")),
    );
    reindexColDropdown.classList.remove("open");
    reindexColBtn.classList.remove("open");
  });
  return el;
}

reindexColDropdown.appendChild(buildReindexColOption(undefined, "All Collections", true));
if (api) {
  for (const col of api.getCollections()) {
    reindexColDropdown.appendChild(buildReindexColOption(col.id, col.name, false));
  }
}

reindexColBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = reindexColDropdown.classList.toggle("open");
  reindexColBtn.classList.toggle("open", isOpen);
});

function closeReindexDropdown() {
  reindexColDropdown.classList.remove("open");
  reindexColBtn.classList.remove("open");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function refreshInfo() {
  if (!api) return;
  infoCountEl.textContent = "…";
  infoChunksEl.textContent = "…";
  infoSizeEl.textContent = "…";
  const { itemCount, chunkCount, sizeBytes } = await api.getIndexStats();
  infoCountEl.textContent = String(itemCount);
  infoChunksEl.textContent = String(chunkCount);
  infoSizeEl.textContent = formatBytes(sizeBytes);
}

function setReindexBusy(busy: boolean) {
  reindexColRun.disabled = busy;
  reindexAllBtn.disabled = busy;
  deleteIndexBtn.disabled = busy;
}

reindexColRun.addEventListener("click", async () => {
  if (!api) return;
  if (reindexCollectionId == null) {
    reindexStatus.textContent = "Select a collection first.";
    return;
  }
  setReindexBusy(true);
  reindexStatus.textContent = "Starting…";
  infoCountEl.textContent = "0";
  infoChunksEl.textContent = "0";
  infoSizeEl.textContent = "…";
  await api.reindexCollection(reindexCollectionId, (done, total, title, totalChunks) => {
    reindexStatus.textContent = `Indexed ${done} / ${total}: ${title}`;
    infoCountEl.textContent = String(done);
    infoChunksEl.textContent = String(totalChunks);
  });
  reindexStatus.textContent = "Done.";
  setReindexBusy(false);
  await refreshInfo();
});

reindexAllBtn.addEventListener("click", async () => {
  if (!api) return;
  setReindexBusy(true);
  reindexStatus.textContent = "Starting…";
  infoCountEl.textContent = "0";
  infoChunksEl.textContent = "0";
  infoSizeEl.textContent = "…";
  await api.reindexAll((done, total, title, totalChunks) => {
    reindexStatus.textContent = `Indexed ${done} / ${total}: ${title}`;
    infoCountEl.textContent = String(done);
    infoChunksEl.textContent = String(totalChunks);
  });
  reindexStatus.textContent = "Done.";
  setReindexBusy(false);
  await refreshInfo();
});

deleteIndexBtn.addEventListener("click", async () => {
  if (!api) return;
  const label = reindexCollectionId == null ? "all" : "collection";
  reindexStatus.textContent = `Deleting ${label} index…`;
  setReindexBusy(true);
  infoCountEl.textContent = "0";
  infoChunksEl.textContent = "0";
  infoSizeEl.textContent = "…";
  await api.deleteIndex(reindexCollectionId);
  reindexStatus.textContent = "Deleted.";
  setReindexBusy(false);
  await refreshInfo();
});

settingsTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    settingsTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.panel;
    settingsPanel.hidden = target !== "settings-panel";
    infoPanel.hidden = target !== "info-panel";
    if (target === "info-panel") refreshInfo();
  });
});

settingsToggle.addEventListener("click", () => {
  const isOpen = settingsDrawer.classList.toggle("open");
  settingsToggle.classList.toggle("active", isOpen);
});


const saveBtn = document.getElementById(
  "sentai-settings-save",
) as HTMLButtonElement;

saveBtn.addEventListener("click", () => {
  if (!api) return;

  const chunkVal = parseInt(chunkInput.value, 10);
  if (!isNaN(chunkVal)) api.setPref("maxChunkTokens", chunkVal);

  const topKVal = parseInt(topKInput.value, 10);
  if (!isNaN(topKVal)) api.setPref("topK", topKVal);

  api.setPref("autoAttachPdf", autoAttachInput.checked);

  const simVal = parseInt(minSimilarityInput.value, 10);
  if (!isNaN(simVal))
    api.setPref("minSimilarity", Math.max(0, Math.min(100, simVal)));

  api.setPref("llmApiKey", llmApiKeyInput.value.trim());
  api.setPref("llmEndpoint", llmEndpointInput.value.trim());
  api.setPref("llmModel", llmModelInput.value.trim());

  saveBtn.textContent = "Saved ✓";
  setTimeout(() => {
    saveBtn.textContent = "Save";
  }, 1500);
});

// ===== Skills bar =====
const skillsBar = document.getElementById("sentai-skills-bar") as HTMLElement;
const skillsChips = document.getElementById(
  "sentai-skills-chips",
) as HTMLElement;
const skillsOpenBtn = document.getElementById(
  "sentai-skills-open",
) as HTMLButtonElement;

function lastUserMessage(): string {
  const container = document.getElementById("sentai-nachrichten");
  if (!container) return "";
  const userBubbles = container.querySelectorAll<HTMLElement>(".message.user");
  if (userBubbles.length === 0) return "";
  return userBubbles[userBubbles.length - 1].textContent?.trim() ?? "";
}

function buildSkillChip(skill: SkillDef): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "s-skill-chip";
  btn.type = "button";
  btn.textContent = skill.icon ? `${skill.icon} ${skill.name}` : skill.name;
  if (skill.description) btn.title = skill.description;
  btn.addEventListener("click", () => {
    const ctx = lastUserMessage();
    chatInput.value = ctx
      ? `${skill.prompt}\n\nContext from our conversation: ${ctx}`
      : skill.prompt;
    sendMessage();
  });
  return btn;
}

if (api) {
  api
    .getSkills()
    .then((skills) => {
      if (skills.length === 0) {
        skillsBar.hidden = true;
        return;
      }
      for (const skill of skills) {
        skillsChips.appendChild(buildSkillChip(skill));
      }
    })
    .catch(() => {
      skillsBar.hidden = true;
    });

  skillsOpenBtn.addEventListener("click", () => {
    api!.openSkillsFolder();
  });
} else {
  skillsBar.hidden = true;
}
