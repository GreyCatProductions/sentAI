import type { EmbeddingRecord, ItemMetadata } from "../types";
import { embeddingStorage } from "./savesystem";
import { embedText } from "../modules/embedder"
import { hashString } from "../utils/hash";

// Dev only: pretty-printed JSON files land here for inspection in VS Code
const DEV_OUTPUT_DIR = "~/sentAI/src/modules/test_embeddings";

const MIN_CHUNK_CHARS = 100;

// ~4 chars per token for English academic prose — good enough without a tokenizer dep
const CHARS_PER_TOKEN = 4;
// text-embedding-3-small supports 8191 tokens; 500 is a practical sweet spot
const MAX_CHUNK_TOKENS = 500;

// Section headings that mark the start of non-content tail material
const REFERENCES_HEADING = /^(references|bibliography|quellen|literatur|works cited|literaturverzeichnis)\s*$/i;

// Short boilerplate lines that survive the length filter
const BOILERPLATE = /^[\d\s.]+$|all rights reserved|downloaded from|©|\bcc\s+by\b|doi:\s*10\.|publisher's note/i;

// PDF ligatures that don't tokenize as their constituent letters
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl",
  "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
};
const LIGATURE_RE = new RegExp(Object.keys(LIGATURES).join("|"), "g");

// Cleans raw PDF-extracted text before chunking:
// fixes encoding artifacts, removes formatting chars, collapses layout whitespace.
export function cleanText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(LIGATURE_RE, m => LIGATURES[m])
    // Soft hyphens (invisible, from PDF glyph encoding)
    .replace(/­/g, "")
    // Line-break hyphenation: "re-\nse arch" → "research"
    .replace(/(\w)-\n[ \t]*/g, "$1")
    // Non-breaking and narrow spaces → regular space
    .replace(/[           ]/g, " ")
    // Zero-width and BOM characters
    .replace(/[​‌‍﻿]/g, "")
    // C0 control characters except \n and \t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Single newlines (PDF line wraps within a paragraph) → space; preserve \n\n paragraph breaks
    .replace(/(?<!\n)\n(?!\n)/g, " ")
    // Multiple spaces → single space
    .replace(/ {2,}/g, " ")
    // Trim each line
    .split("\n").map(l => l.trim()).join("\n")
    // Normalise paragraph breaks to exactly two newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Splits on sentence boundaries: punctuation followed by whitespace + uppercase/quote/paren.
// Avoids splitting on abbreviations like "Fig. 1" or "et al." by requiring the next word
// to start with an uppercase letter.
function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"(])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function isNoise(chunk: string): boolean {
  const trimmed = chunk.trim();
  if (trimmed.length < MIN_CHUNK_CHARS) return true;
  if (BOILERPLATE.test(trimmed)) return true;
  return false;
}

// Splits extracted PDF text into sentence-aware chunks within a token budget.
// Drops headers/footers, boilerplate, and everything from the references section onward.
export function chunkText(text: string, maxTokens = MAX_CHUNK_TOKENS): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let bucket: string[] = [];
  let bucketTokens = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const chunk = bucket.join(" ").trim();
    if (!isNoise(chunk)) chunks.push(chunk);
    bucket = [];
    bucketTokens = 0;
  };

  for (const para of paragraphs) {
    if (REFERENCES_HEADING.test(para.trim())) break;

    for (const sentence of toSentences(para)) {
      const t = estimateTokens(sentence);
      if (bucketTokens + t > maxTokens) flush();
      bucket.push(sentence);
      bucketTokens += t;
    }
  }
  flush();
  return chunks;
}

function extractMetadata(item: Zotero.Item): ItemMetadata {
  const parent = item.parentItem ?? item;
  const creators = parent.getCreators();
  const authors = creators
    .filter(c => c.creatorTypeID === Zotero.CreatorTypes.getID("author"))
    .map(c => [c.lastName, c.firstName].filter(Boolean).join(", "))
    .join("; ");
  return {
    title: (parent.getField("title") as string) || undefined,
    authors: authors || undefined,
    year: (parent.getField("year") as string) || undefined,
    abstract: (parent.getField("abstractNote") as string) || undefined,
  };
}

function buildEmbeddingInput(chunk: string, meta: ItemMetadata): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`Title: ${meta.title}`);
  if (meta.authors) parts.push(`Authors: ${meta.authors}`);
  if (meta.year) parts.push(`Year: ${meta.year}`);
  if (meta.abstract) parts.push(`Abstract: ${meta.abstract}`);
  return parts.length > 0 ? parts.join("\n") + "\n\n" + chunk : chunk;
}

export class PdfIndexer {
  // Entry point — called by hooks.ts whenever a new PDF is added to Zotero
  static async process(item: Zotero.Item) {
    const path = await item.getFilePathAsync();
    Zotero.debug(`sentAI: New PDF uploaded: ${path}`);

    const metadata = extractMetadata(item);

    // Extract full text via Zotero's built-in PDF worker (0 = no page limit)
    const { text: rawText } = await Zotero.PDFWorker.getFullText(item.id, 0);
    const chunks: string[] = chunkText(cleanText(rawText));
    Zotero.debug(`sentAI: ${chunks.length} chunks to embed`);

    const records: EmbeddingRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const embeddingInput = buildEmbeddingInput(text, metadata);
      const embedding = await embedText(embeddingInput);
      const textHash = hashString(text)
      records.push({
        paperId: item.key,
        chunkIndex: i,
        chunkText: text,
        embedding,
        textHash,
        metadata,
        createdAt: Date.now(),
      });
    }

    await embeddingStorage.save(item.id, records);
    Zotero.debug(`sentAI: saved ${records.length} embeddings for item ${item.id}`);

    // Write a readable copy to the project folder for dev inspection
    if (typeof addon !== "undefined" && addon.data.env === "development") {
      Zotero.File.createDirectoryIfMissing(DEV_OUTPUT_DIR);
      await Zotero.File.putContentsAsync(
        PathUtils.join(DEV_OUTPUT_DIR, `${item.id}.json`),
        JSON.stringify(records, null, 2),
      );
    }
  }
}
