import type { EmbeddingRecord } from "../types";
import { normalize, dotProduct } from "../utils/vector";


interface SearchResult {
  paperId: string;
  chunkText: string;
  similarity: number;
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

  for (const chunk of chunks) {
    // The chunk embedding is normalized before comparison to calculate cosine similarity.
    const similarity = dotProduct(
      queryEmbedding,
      normalize(chunk.embedding)
    );

    results.push({
      paperId: chunk.paperId,
      chunkText: chunk.chunkText,
      similarity
    });
  }

  // Highest similarity should appear first.
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

