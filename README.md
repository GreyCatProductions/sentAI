<div align="center">

# sentAI

**Semantic search for your Zotero research library**

[![Zotero](https://img.shields.io/badge/Zotero-9-CC2936?style=for-the-badge&logo=zotero&logoColor=white)](https://www.zotero.org)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-4B6BFB?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

_Stop ctrl+F-ing through papers. Ask your library what it knows._

</div>

---

sentAI is a Zotero 9 plugin that indexes your PDFs as semantic vectors and lets you search them by **meaning** using cosine similarity. Powered by our server as default or a provider of your choice. All data is stored locally and is not saved anywhere outside of your device.

## How it works

```mermaid
flowchart TB
  %% sentAI architecture
  pdf["PDF added to Zotero"]:::event
  item["Zotero item (A paper for example)"]:::event

  extract["Text extraction\nZotero PDF worker"]:::process
  clean["Clean + normalize text\nremove ligatures, boilerplate, refs"]:::process
  chunk["Paragraph-aware chunking\nbody + abstract chunks"]:::process
  embed{"Embedding provider"}:::decision
  azure["Azure\ntext-embedding-3-small"]:::cloud
  ollamaEmbed["Ollama\nnomic-embed-text"]:::local
  store[("Local SQLite index\nsentai/sentai.sqlite\nmodel-id tagged vectors")]:::storage
  tag["Zotero item tag\nsentai-indexed"]:::storage

  query["Search or Chat query"]:::event
  filters["Collection, tag, year,\ntype + similarity filters"]:::process
  keywords["Keyword extraction\nLLM distills query"]:::process
  qembed["Embed search intent\nsame provider as indexing"]:::process
  guard["Model-id guard\nignore incompatible vectors"]:::process
  cosine["Cosine similarity\npaper-first retrieval"]:::process
  prompt["Grounded prompt\npaper excerpts + question"]:::process
  chat{"Chat provider"}:::decision
  gemini["Gemini / Anthropic /\nOpenAI-compatible"]:::cloud
  ollamaChat["Ollama\nllama3.1:8b"]:::local
  answer["Answer with inline citations\n[Paper Title]"]:::result

  item --> auto --> pdf
  pdf --> extract --> clean --> chunk --> embed
  embed --> azure --> store
  embed --> ollamaEmbed --> store
  store --> tag

  query --> filters --> keywords --> qembed --> guard --> cosine
  store --> guard
  cosine --> prompt --> chat
  chat --> gemini --> answer
  chat --> ollamaChat --> answer

  classDef event fill:#111827,stroke:#4B6BFB,color:#F9FAFB,stroke-width:2px;
  classDef process fill:#EEF2FF,stroke:#4B6BFB,color:#111827;
  classDef decision fill:#FFF7ED,stroke:#F97316,color:#111827,stroke-width:2px;
  classDef cloud fill:#ECFEFF,stroke:#0891B2,color:#111827;
  classDef local fill:#ECFDF5,stroke:#059669,color:#111827;
  classDef storage fill:#FDF2F8,stroke:#DB2777,color:#111827;
  classDef result fill:#18181B,stroke:#22C55E,color:#FAFAFA,stroke-width:2px;
```

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as sentAI Chat Panel
  participant Search as Search Service
  participant Index as Local SQLite Index
  participant LLM as LLM Provider

  User->>UI: Ask a question
  UI->>Search: Send query + filters
  Search->>LLM: Extract retrieval keywords
  LLM-->>Search: Focused search terms
  Search->>Index: Load matching model-id vectors
  Search->>Search: Rank by cosine similarity
  Search-->>UI: Top paper excerpts
  UI->>LLM: Build grounded prompt
  LLM-->>UI: Answer using only excerpts
  UI-->>User: Response with inline citations
```

## Features

|                          |                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Auto-indexing**        | Every PDF you add is chunked and embedded automatically                                                                 |
| **Auto-attach**          | Items without a PDF trigger a download attempt before indexing                                                          |
| **Semantic search**      | Cosine similarity over your full library, surfacing the most relevant passages                                          |
| **RAG answers**          | Chat tab calls Gemini 2.5 Flash, answering from retrieved chunks with inline paper citations                            |
| **Keyword extraction**   | A lightweight Gemini Flash Lite call distils your question into search terms before embedding — better retrieval signal |
| **Collection filter**    | Restrict any search to a specific Zotero collection via a dropdown in the Search tab                                    |
| **Similarity threshold** | Configurable minimum score (default 10 %) — chunks below it never reach the LLM                                         |
| **References filtering** | Indexing stops at "References" / "Bibliography" headings — no citation lists in the index                               |
| **Two-tab UI**           | **Search** tab for direct semantic search with scored result cards; **Chat** tab for RAG answers                        |
| **Result cards**         | Title, match score %, 2-line snippet, author / year / journal chips                                                     |
| **Fully local storage**  | Vectors live in your Zotero data directory — only embedding and LLM requests hit the cloud                              |

## Requirements

- [Zotero 9](https://www.zotero.org)


## Usage

1. Download the latest deployment (file ending with .xpi)
2. Add it to Zotero (https://www.zotero.org/support/plugins)
3. Enable it in Zotero Plugin Settings
4. Open sentAI window by clicking its icon next to the default search field
5. Use "Search" tab to use semantic search directly or "Chat" tab if you want a more interactive session

Each result shows the paper title, a similarity score, and the matching passage.

## Local mode (Ollama)

Run embeddings and/or chat entirely on your own machine instead of Azure/Gemini — no API keys, nothing leaves your computer.

**1. Install Ollama**

```sh
brew install ollama
```

**2. Start it as a background service**

```sh
brew services start ollama
```

**3. Pull the models**

```sh
ollama pull nomic-embed-text   # embeddings
ollama pull llama3.1:8b        # chat / RAG answers
```

**4. Enable it in sentAI**

Open the Chat panel → ⚙️ Settings → check **"Use local Ollama (embeddings + chat)"** → Save.
Since it is a different model, you will need to reindex articles.