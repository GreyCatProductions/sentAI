import fetch from "node-fetch";
import type { EmbeddingRecord } from "../types";
import fs from "fs";

const raw = fs.readFileSync("test_embeddings/17.json", "utf-8");
const chunks = JSON.parse(raw);

// Test query that is converted into an embedding before the search starts.
const queryEmbedding = await embedText(
  "AI in corporate governance"
);

/**
  Calls the Azure embedding endpoint and returns the vector representation
  of the given text. This vector is later compared with stored chunk vectors.
 */

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(__azure_embedding_endpoint__, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": __azure_api_key__,
    },
    body: JSON.stringify({ input: text }),
  });

  const json = await res.json() as {
    data: { embedding: number[] }[];
  };

  return json.data[0].embedding;
}


interface SearchResult {
  paperId: string;
  chunkText: string;
  similarity: number;
}

/**
  Normalizes a vector to length 1 so that vectors can be compared
  independently of their original magnitude.
 */


function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(
    vec.reduce((sum, x) => sum + x * x, 0)
  );

  return vec.map(x => x / norm);
}

/**
  Calculates the dot product of two vectors.
  For normalized vectors, this represents their cosine similarity.
 */

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

/**
  Compares the query embedding with all stored text chunk embeddings
  and returns the most similar chunks.
 */

function semanticSearch(
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

console.log(semanticSearch(queryEmbedding, chunks))