import type { EmbeddingRecord, ItemMetadata } from "../types";
import { normalize, dotProduct } from "../utils/vector";

export interface SearchResult {
  paperId: string;
  chunkText: string;
  chunkIndex: number;
  chunkKind?: EmbeddingRecord["chunkKind"];
  similarity: number;
  metadata?: ItemMetadata;
}

function toResult(chunk: EmbeddingRecord, similarity: number): SearchResult {
  return {
    paperId: chunk.paperId,
    chunkText: chunk.chunkText,
    chunkIndex: chunk.chunkIndex,
    chunkKind: chunk.chunkKind,
    similarity,
    metadata: chunk.metadata,
  };
}

/**
  Compares the query embedding with all stored text chunk embeddings
  and returns the most similar topK chunks.
 */
export function semanticSearch(
  queryEmbedding: number[],
  chunks: EmbeddingRecord[],
  topK = 10,
): SearchResult[] {
  const normalizedQuery = normalize(queryEmbedding);

  const results = chunks.map((chunk) =>
    toResult(chunk, dotProduct(normalizedQuery, normalize(chunk.embedding))),
  );

  // Highest similarity should appear first.
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

export interface PaperRetrievalOptions {
  topPapers?: number; // number of distinct papers to surface
  perPaper?: number; // max body chunks kept per paper
}

/**
  Paper-diversified retrieval for RAG.

  Flat top-K retrieval breaks down once a library has many papers: a single paper
  routinely holds 10+ chunks, so the top-K slots fill up with near-duplicate
  excerpts from one or two papers and never reach the others. This retrieves in
  two stages instead:

    1. Rank *papers*, scoring each by its abstract chunk when it has one
       (a clean paper-level signal) and otherwise by its best body chunk.
    2. Within each of the top `topPapers`, keep the `perPaper` most relevant
       body chunks — the content the answer actually quotes.

  The result spans `topPapers` distinct papers with a bounded number of chunks
  each, so breadth no longer competes with depth for the same budget.
 */
export function semanticSearchByPaper(
  queryEmbedding: number[],
  chunks: EmbeddingRecord[],
  { topPapers = 5, perPaper = 2 }: PaperRetrievalOptions = {},
): SearchResult[] {
  const normalizedQuery = normalize(queryEmbedding);

  interface Scored {
    record: EmbeddingRecord;
    similarity: number;
  }

  const byPaper = new Map<string, Scored[]>();
  for (const record of chunks) {
    const similarity = dotProduct(normalizedQuery, normalize(record.embedding));
    const arr = byPaper.get(record.paperId);
    if (arr) arr.push({ record, similarity });
    else byPaper.set(record.paperId, [{ record, similarity }]);
  }

  // Stage 1 — score and rank papers.
  const papers = Array.from(byPaper.entries()).map(([paperId, scored]) => {
    const abstractSims = scored
      .filter((s) => s.record.chunkKind === "abstract")
      .map((s) => s.similarity);
    const score = abstractSims.length
      ? Math.max(...abstractSims)
      : Math.max(...scored.map((s) => s.similarity));
    return { paperId, score, scored };
  });
  papers.sort((a, b) => b.score - a.score);

  // Stage 2 — pull the best body chunks from each selected paper.
  const out: SearchResult[] = [];
  for (const paper of papers.slice(0, topPapers)) {
    const body = paper.scored
      .filter((s) => s.record.chunkKind !== "abstract")
      .sort((a, b) => b.similarity - a.similarity);
    // Fall back to the abstract for papers with no indexed body text.
    const picked = (body.length ? body : paper.scored).slice(0, perPaper);
    for (const s of picked) out.push(toResult(s.record, s.similarity));
  }

  // Lead the context with the strongest excerpts overall.
  out.sort((a, b) => b.similarity - a.similarity);
  return out;
}
