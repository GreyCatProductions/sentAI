import type { EmbeddingRecord } from "../types";
import { embeddingStorage } from "./savesystem";
import { embedText } from "../modules/embedder"
import { hashString } from "../utils/hash";

// Dev only: pretty-printed JSON files land here for inspection in VS Code
const DEV_OUTPUT_DIR = "~/sentAI/src/modules/test_embeddings";

// Splits extracted PDF text into ~1000-char paragraphs to stay within embedding model input limits
export function chunkText(text: string, maxChunkSize = 1000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += "\n\n" + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export class PdfIndexer {
  // Entry point — called by hooks.ts whenever a new PDF is added to Zotero
  static async process(item: Zotero.Item) {
    const path = await item.getFilePathAsync();
    Zotero.debug(`sentAI: New PDF uploaded: ${path}`);

    // Extract full text via Zotero's built-in PDF worker (0 = no page limit)
    const { text } = await Zotero.PDFWorker.getFullText(item.id, 0);
    const chunks: string[] = chunkText(text);
    Zotero.debug(`sentAI: ${chunks.length} chunks to embed`);

    const records: EmbeddingRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const embedding = await embedText(text);
      const textHash = hashString(text)
      records.push({
        paperId: String(item.id),
        chunkIndex: i,
        chunkText: text,
        embedding,
        textHash,
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
