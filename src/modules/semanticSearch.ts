import type { EmbeddingRecord, ItemMetadata } from "../types";
import { normalize, dotProduct } from "../utils/vector";

interface SearchResult {
  paperId: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
  metadata?: ItemMetadata;
}

/**
  Compares the query embedding with all stored text chunk embeddings
  and returns the most similar topK chunks.
 */
export function semanticSearch(
  queryEmbedding: number[],
  chunks: EmbeddingRecord[],
  topK = 10
): SearchResult[] {

  const results: SearchResult[] = [];
  const normalizedQuery = normalize(queryEmbedding);

  for (const chunk of chunks) {
    const similarity = dotProduct(
      normalizedQuery,
      normalize(chunk.embedding)
    );

    results.push({
      paperId: chunk.paperId,
      chunkText: chunk.chunkText,
      chunkIndex: chunk.chunkIndex,
      similarity,
      metadata: chunk.metadata,
    });
  }

  // Highest similarity should appear first.
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

