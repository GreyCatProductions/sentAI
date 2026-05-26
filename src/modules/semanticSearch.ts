import fetch from "node-fetch";
import type { EmbeddingRecord } from "../types";
import fs from "fs";

const raw = fs.readFileSync("test_embeddings/17.json", "utf-8");
const chunks = JSON.parse(raw);
const queryEmbedding = await embedText(
  "AI in corporate governance"
);

// Calls Azure text-embedding-3-small to get the embedding vector
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


function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(
    vec.reduce((sum, x) => sum + x * x, 0)
  );

  return vec.map(x => x / norm);
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

function semanticSearch(
  queryEmbedding: number[],
  chunks: EmbeddingRecord[],
  topK = 10
): SearchResult[] {

  const results: SearchResult[] = [];

  for (const chunk of chunks) {

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

  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

console.log(semanticSearch(queryEmbedding, chunks))