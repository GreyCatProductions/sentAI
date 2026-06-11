<div align="center">

# sentAI

**Semantic search for your Zotero research library**

[![Zotero](https://img.shields.io/badge/Zotero-9-CC2936?style=for-the-badge&logo=zotero&logoColor=white)](https://www.zotero.org)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-4B6BFB?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

*Stop ctrl+F-ing through papers. Ask your library what it knows.*

</div>

---

sentAI is a Zotero 9 plugin that indexes your PDFs as semantic vectors and lets you search them by **meaning**, not keywords. Powered by Azure AI embeddings and cosine similarity — all stored locally.

## How it works

```
 PDF added to Zotero
         │
         ▼
  ┌─────────────────┐
  │  Text Extraction │  ← Zotero's built-in PDF worker
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │    Chunking      │  ← ~1000-char, paragraph-aware splits
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │   Embedding      │  ← local server → Azure OpenAI
  └────────┬────────┘       text-embedding-3-small
           │
           ▼
  ┌─────────────────┐
  │  Local Storage   │  ← <Zotero data dir>/sentai/embeddings/
  └─────────────────┘


 Search query (Tools → sentAI Chat)
         │
         ▼
  embed query → cosine similarity over all stored chunks → top 5 results
```

## Features

| | |
|---|---|
| **Auto-indexing** | Every PDF you add is chunked and embedded automatically |
| **Semantic search** | Cosine similarity over your full library, surfacing the most relevant passages |
| **Chat panel** | Built-in panel accessible from the Zotero Tools menu |
| **Fully local storage** | Vectors live in your Zotero data directory — only embedding requests hit the cloud |

## Requirements

- [Zotero 9](https://www.zotero.org)
- [Node.js LTS](https://nodejs.org/en/)
- An Azure AI / Cognitive Services API key with a `text-embedding-3-small` deployment

## Setup

**1. Clone and install**

```sh
git clone https://github.com/GreyCatProductions/sentAI.git
cd sentAI
npm install
cp .env.example .env
```

**2. Configure `.env`**

| Variable | Description |
|---|---|
| `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` | Path to your Zotero binary |
| `ZOTERO_PLUGIN_PROFILE_PATH` | Path to your Zotero dev profile |
| `AZURE_EMBEDDING_ENDPOINT` | Full Azure endpoint URL (incl. deployment + api-version) |
| `AZURE_API_KEY` | Azure Cognitive Services API key |

**3. Start the embedding server**

```sh
cd server && npm install && npm run dev
```

**4. Launch Zotero with the plugin**

```sh
npm start
```

Builds the plugin, launches Zotero, and watches `src/` for hot reload.

## Usage

1. Add a PDF to Zotero — indexing runs automatically in the background
2. Open **Tools → sentAI Chat**
3. Type a natural-language query and click **Search**

Each result shows the paper title, a similarity score, and the matching passage.

## Dev commands

```sh
npm start          # Dev server with hot reload
npm run build      # Production build → .scaffold/build/
npm run lint:check # Prettier + ESLint check
npm run lint:fix   # Prettier + ESLint auto-fix
npm test           # Run tests inside Zotero (requires npm start)
npm run release    # Bump version, commit, tag, push → GitHub Actions release
```

## Status

| Feature | |
|---|---|
| PDF detection on upload | `done` |
| Text extraction | `done` |
| Paragraph-aware chunking | `done` |
| Embedding via Azure `text-embedding-3-small` | `done` |
| Local vector storage | `done` |
| Cosine similarity search | `done` |
| Chat panel UI | `done` |
| RAG / LLM answer generation | `planned` |

---

See [`notes/`](./notes/) for architecture decisions, vision, and work history.
