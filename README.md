# sentAI

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)

A Zotero 7 plugin for **semantic search over your personal research library**. Instead of keyword matching, sentAI lets you find papers by meaning — powered by local embeddings via Ollama and a vector index.

## What it does

When you add a PDF to Zotero, sentAI automatically:
1. Extracts the full text using Zotero's built-in PDF worker
2. Splits it into chunks (~1000 chars, paragraph-aware)
3. Generates embeddings via a local Ollama model (`nomic-embed-text`)
4. Stores the embeddings locally in your Zotero data directory

This builds up a searchable index of your library — no cloud, no API keys, everything stays on your machine.

## Requirements

- [Zotero 7](https://www.zotero.org/support/beta_builds)
- [Node.js LTS](https://nodejs.org/en/)
- [Ollama](https://ollama.ai) running locally with the embedding model pulled:
  ```sh
  ollama pull nomic-embed-text
  ```

## Setup

```sh
git clone <this repo>
cd sentAI
npm install
cp .env.example .env
# Edit .env: set ZOTERO_PLUGIN_ZOTERO_BIN_PATH and ZOTERO_PLUGIN_PROFILE_PATH
npm start
```

`npm start` builds the plugin, launches Zotero with it loaded, and watches `src/` for hot reload.

## Commands

```sh
npm start          # Dev server with hot reload
npm run build      # Production build → .scaffold/build/
npm run lint:check # Prettier + ESLint check
npm run lint:fix   # Prettier + ESLint auto-fix
npm test           # Run tests inside Zotero (requires npm start)
npm run release    # Bump version, commit, tag, push → GitHub Actions release
```

## Architecture

```
PDF added to Zotero
      │
      ▼
hooks.ts → onNotify (filters for PDF attachments)
      │
      ▼
pdfIndexer.ts → PdfIndexer.process(item)
      │
      ├── Zotero.PDFWorker.getFullText()   — text extraction
      ├── chunkText()                       — paragraph-aware chunking
      ├── embedChunk() → Ollama API         — local embedding
      └── embeddingStorage.save()           — persist to disk
```

Embeddings are stored as JSON files in `<Zotero data dir>/sentai/embeddings/<itemId>.json`.

**Planned:** vector index (Vectra) for similarity search + RAG with a local LLM.

## Status

| Feature | Status |
|---------|--------|
| PDF detection on upload | Done |
| Text extraction | Done |
| Chunking | Done |
| Embedding via Ollama | Done |
| Local storage | Done |
| Similarity search | Planned |
| RAG / LLM integration | Planned |
| UI | Planned |

## Notes

See [`notes/`](./notes/) for architecture decisions, vision, and work history.
