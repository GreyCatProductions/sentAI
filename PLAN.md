# sentAI RAG Implementation Plan

## What RAG is

RAG (Retrieval-Augmented Generation) = a chatbot that answers from *your own documents*
instead of generic training data. The flow:

```
Your question
  → search your indexed papers (already done)
  → feed the matching chunks to an LLM
  → LLM answers using only that material, citing the source paper
```

Result: "Memory consolidation happens during sleep [Stickgold 2005]" — grounded in
your library, not hallucinated.

---

## What is already built

- [x] PDF text extraction (`Zotero.PDFWorker.getFullText`)
- [x] Chunking into ≤1000-char paragraphs (`src/modules/pdfIndexer.ts`)
- [x] Embedding every chunk via Azure → saved to disk (`src/modules/embedder.ts`, `savesystem.ts`)
- [x] Semantic search: embed query → cosine rank → top-K chunks with paper title (`src/modules/semanticSearch.ts`, `searchService.ts`)
- [x] Chat panel UI with Send button (`addon/content/chatPanel.xhtml`, `src/chatPanel.ts`)
- [x] Express proxy server for embedding API (`server/src/index.ts`)
- [x] `GEMINI_API_KEY` in `.env`

---

## What is missing

Everything hard is done. What remains is wiring the LLM call.

---

## Phase 1 — Basic RAG with citations

Citations are free: each `SearchResult` already has `title`. Format chunks as
`[Title]\n{text}` and tell Gemini to cite inline — no extra work needed.

- [x] Inject `GEMINI_API_KEY` at build time in `zotero-plugin.config.ts` (same pattern as `__server_url__`)
- [x] Declare `__gemini_api_key__: string` in `typings/global.d.ts`
- [x] Create `src/modules/ragService.ts` — calls `search()`, formats chunks as `[title]\ntext`, calls Gemini REST API
- [x] System prompt tells Gemini to cite `[Paper Title]` inline per claim
- [x] Add `ask(query: string): Promise<string>` to `addon.api` in `hooks.ts`
- [x] Update `Api` type in `chatPanel.ts` to include `ask`
- [x] Wire Send button in `chatPanel.ts` to call `api.ask()` and display the response
- [x] Add `GEMINI_API_KEY` to `.env.example`

**Done when:** pressing Send returns a cited answer grounded in your papers.

---

## Phase 2 — Conversation history

Make follow-up questions work ("what else does that paper say?").

- [ ] Add `messages: { role: string; content: string }[]` to chat panel state
- [ ] Append each user message and assistant reply to the history after every turn
- [ ] Pass last N messages to Gemini as a multi-turn conversation
- [ ] Cap history to avoid token overflow (e.g. last 10 turns)

**Done when:** "tell me more" resolves correctly without re-explaining context.

---

## Phase 3 — Query rewriting

Improve retrieval quality by rephrasing the question before searching.

- [ ] Before `search()`, ask Gemini to rewrite the raw question into a better search query
- [ ] Use rewritten query for embedding + cosine search; show original in UI
- [ ] Keep rewrite call lightweight (no history, low token limit)

**Done when:** vague questions retrieve meaningfully better chunks than before.

---

## Phase 4 — Streaming responses

Make the UI feel alive instead of frozen while Gemini thinks.

- [ ] Switch Gemini call to SSE streaming (`alt=sse` query param)
- [ ] Expose a `stream` method on `addon.api` that yields tokens
- [ ] Update chat bubble to append tokens as they arrive
- [ ] Show blinking cursor while streaming

**Done when:** the answer appears word-by-word like ChatGPT.
