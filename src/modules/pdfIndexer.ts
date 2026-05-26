import type { EmbeddingRecord } from "../types";
import { embeddingStorage } from "./savesystem";

// Dev only: pretty-printed JSON files land here for inspection in VS Code
const DEV_OUTPUT_DIR = "/Users/philipp/Documents/Repos/zotero/sentAI/src/modules/test_embeddings";

// Splits extracted PDF text into ~1000-char paragraphs to stay within embedding model input limits
function chunkText(text: string, maxChunkSize = 1000): string[] {
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

// Computes a djb2 hash and calls Azure text-embedding-3-small to get the embedding vector
async function embedChunk(chunk: string): Promise<{ embedding: number[]; textHash: string }> {
  let h = 5381;
  for (let i = 0; i < chunk.length; i++) {
    h = (((h << 5) + h) ^ chunk.charCodeAt(i)) >>> 0;
  }
  const res = await fetch(__azure_embedding_endpoint__, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": __azure_api_key__,
    },
    body: JSON.stringify({ input: chunk }),
  });
  const json = (await res.json() as unknown) as { data: { embedding: number[] }[] };
  return { embedding: json.data[0].embedding, textHash: h.toString(16) };
}

export class PdfIndexer {
  // Entry point — called by hooks.ts whenever a new PDF is added to Zotero
  static async process(item: Zotero.Item) {
    const path = await item.getFilePathAsync();
    ztoolkit.log("sentAI: New PDF uploaded:", path);

    // Extract full text via Zotero's built-in PDF worker (0 = no page limit)
    const { text } = await Zotero.PDFWorker.getFullText(item.id, 0);
    const chunks = chunkText(text);
    ztoolkit.log(`sentAI: ${chunks.length} chunks to embed`);

    const records: EmbeddingRecord[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const { embedding, textHash } = await embedChunk(chunks[i]);
      records.push({
        paperId: item.key,
        chunkIndex: i,
        chunkText: chunks[i],
        embedding,
        textHash,
        createdAt: Date.now(),
      });
    }

    await embeddingStorage.save(item.id, records);
    ztoolkit.log(`sentAI: saved ${records.length} embeddings for item ${item.id}`);

    // Write a readable copy to the project folder for dev inspection
    if (addon.data.env === "development") {
      await Zotero.File.putContentsAsync(
        PathUtils.join(DEV_OUTPUT_DIR, `${item.id}.json`),
        JSON.stringify(records, null, 2),
      );
    }
  }
}
