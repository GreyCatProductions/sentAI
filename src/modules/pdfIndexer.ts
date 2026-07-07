import type { EmbeddingRecord, ItemMetadata } from "../types";
import { embeddingStorage } from "./savesystem";
import { embedText } from "../modules/embedder";
import { hashString } from "../utils/hash";
import { getPref } from "../utils/prefs";

export const INDEXED_TAG = "sentai-indexed";

const MIN_CHUNK_CHARS = 100;

// Below this length an "abstract" is usually a truncated stub or a stray
// sentence, not worth a dedicated paper-level chunk.
const MIN_ABSTRACT_CHARS = 120;

// ~4 chars per token for English academic prose — good enough without a tokenizer dep
const CHARS_PER_TOKEN = 4;
// text-embedding-3-small supports 8191 tokens; 500 is a practical sweet spot
const MAX_CHUNK_TOKENS = 500;

// Section headings that mark the start of non-content tail material
const REFERENCES_HEADING =
  /^(references|bibliography|quellen|literatur|works cited|literaturverzeichnis)\s*$/i;
const ABSTRACT_HEADING =
  /(?:^|\n)\s*abstract\s*[:.\-–—]?\s+|(?:^|\s)abstract\s*[:.\-–—]\s+|(?:^|\s)abstract\s+(?=(?:this|we|the|in\s+this|background|objective|purpose|methods?|results?|conclusions?)\b)/i;
const ABSTRACT_STOP_HEADING =
  /\s+(keywords?|index terms|introduction|background|related work|methods?|materials and methods|1\.?\s+introduction|i\.?\s+introduction)\b[:.\-–—]?\s*/gi;
const ABSTRACT_SEARCH_WINDOW_CHARS = 8000;
const MAX_ABSTRACT_CHARS = 3500;

// Short boilerplate lines that survive the length filter
const BOILERPLATE =
  /^[\d\s.]+$|all rights reserved|downloaded from|©|\bcc\s+by\b|doi:\s*10\.|publisher's note/i;

// PDF ligatures that don't tokenize as their constituent letters
const LIGATURES: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
};
const LIGATURE_RE = new RegExp(Object.keys(LIGATURES).join("|"), "g");

// Cleans raw PDF-extracted text before chunking:
// fixes encoding artifacts, removes formatting chars, collapses layout whitespace.
export function cleanText(raw: string): string {
  return (
    raw
      .normalize("NFC")
      .replace(LIGATURE_RE, (m) => LIGATURES[m])
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
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      // Normalise paragraph breaks to exactly two newlines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
    .map((s) => s.trim())
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
export function chunkText(
  text: string,
  maxTokens = MAX_CHUNK_TOKENS,
): string[] {
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

export function extractAbstractFromText(text: string): string | undefined {
  const firstPages = text.slice(0, ABSTRACT_SEARCH_WINDOW_CHARS);
  const marker = ABSTRACT_HEADING.exec(firstPages);
  if (!marker) return undefined;

  const start = marker.index + marker[0].length;
  let candidate = firstPages.slice(start, start + MAX_ABSTRACT_CHARS).trim();

  ABSTRACT_STOP_HEADING.lastIndex = 0;
  let stop: RegExpExecArray | null;
  while ((stop = ABSTRACT_STOP_HEADING.exec(candidate)) !== null) {
    if (stop.index >= MIN_ABSTRACT_CHARS / 2) {
      candidate = candidate.slice(0, stop.index).trim();
      break;
    }
  }

  candidate = candidate
    .replace(/\s+/g, " ")
    .replace(/^(abstract|summary)\s*[:.\-–—]?\s*/i, "")
    .trim();

  return candidate.length >= MIN_ABSTRACT_CHARS ? candidate : undefined;
}

function extractMetadata(item: Zotero.Item): ItemMetadata {
  const parent = item.parentItem ?? item;
  const creators = parent.getCreators();
  const authors = creators
    .filter((c) => c.creatorTypeID === Zotero.CreatorTypes.getID("author"))
    .map((c) => [c.lastName, c.firstName].filter(Boolean).join(", "))
    .join("; ");
  return {
    title: (parent.getField("title") as string) || undefined,
    authors: authors || undefined,
    year: (parent.getField("year") as string) || undefined,
    abstract: (parent.getField("abstractNote") as string) || undefined,
  };
}

// Prefixes a chunk with lightweight bibliographic context so the embedding
// carries paper identity. The abstract is deliberately NOT included here: it now
// lives in its own chunk, and repeating it in every body chunk smears the same
// paper-level signal across all of a paper's chunks — which is what lets a single
// paper dominate top-K retrieval.
function buildEmbeddingInput(chunk: string, meta: ItemMetadata): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`Title: ${meta.title}`);
  if (meta.authors) parts.push(`Authors: ${meta.authors}`);
  if (meta.year) parts.push(`Year: ${meta.year}`);
  return parts.length > 0 ? parts.join("\n") + "\n\n" + chunk : chunk;
}

// Embedding input for the dedicated abstract chunk: title/authors/year context
// plus the abstract itself, so it ranks well for broad, thematic queries.
function buildAbstractInput(abstract: string, meta: ItemMetadata): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`Title: ${meta.title}`);
  if (meta.authors) parts.push(`Authors: ${meta.authors}`);
  if (meta.year) parts.push(`Year: ${meta.year}`);
  parts.push(`Abstract: ${abstract}`);
  return parts.join("\n");
}

export class PdfIndexer {
  // Entry point — called by hooks.ts whenever a new PDF is added to Zotero
  static async process(item: Zotero.Item): Promise<number> {
    const path = await item.getFilePathAsync();
    Zotero.debug(`sentAI: New PDF uploaded: ${path}`);

    const metadata = extractMetadata(item);

    // Extract full text via Zotero's built-in PDF worker (0 = no page limit)
    const { text: rawText } = await Zotero.PDFWorker.getFullText(item.id, 0);
    const maxChunkTokens =
      (getPref("maxChunkTokens") as number) || MAX_CHUNK_TOKENS;
    const cleanPdfText = cleanText(rawText);
    const bodyChunks: string[] = chunkText(cleanPdfText, maxChunkTokens);

    // A dedicated abstract chunk (when we have one) gives every paper a single
    // paper-level representation, so retrieval can rank papers by their abstract
    // instead of by whichever body chunk happens to match — see semanticSearch.
    const abstract =
      metadata.abstract?.trim() || extractAbstractFromText(cleanPdfText);
    const hasAbstractChunk =
      !!abstract && abstract.length >= MIN_ABSTRACT_CHARS;
    Zotero.debug(
      `sentAI: ${bodyChunks.length} body chunks${hasAbstractChunk ? " + 1 abstract chunk" : ""} to embed`,
    );

    const records: EmbeddingRecord[] = [];
    let chunkIndex = 0;

    if (hasAbstractChunk) {
      const embedding = await embedText(buildAbstractInput(abstract, metadata));
      records.push({
        paperId: item.key,
        chunkIndex: chunkIndex++,
        chunkText: abstract,
        chunkKind: "abstract",
        embedding,
        textHash: hashString(abstract),
        metadata,
      });
    }

    for (const text of bodyChunks) {
      const embeddingInput = buildEmbeddingInput(text, metadata);
      const embedding = await embedText(embeddingInput);
      records.push({
        paperId: item.key,
        chunkIndex: chunkIndex++,
        chunkText: text,
        chunkKind: "body",
        embedding,
        textHash: hashString(text),
        metadata,
      });
    }

    await embeddingStorage.save(item.id, records);
    Zotero.debug(
      `sentAI: saved ${records.length} embeddings for item ${item.id}`,
    );

    const parent = item.parentItem ?? item;
    parent.addTag(INDEXED_TAG);
    await parent.saveTx();
    return records.length;
  }
}
