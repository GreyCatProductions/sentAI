import { assert } from "chai";
import { semanticSearch } from "../src/modules/semanticSearch";
import type { EmbeddingRecord } from "../src/types";

const testChunks: EmbeddingRecord[] = [
  { paperId: "A", chunkIndex: 0, chunkText: "foo", embedding: [1, 0], textHash: "h1", createdAt: 0 },
  { paperId: "B", chunkIndex: 0, chunkText: "bar", embedding: [0, 1], textHash: "h2", createdAt: 0 },
  { paperId: "C", chunkIndex: 0, chunkText: "baz", embedding: [1, 1], textHash: "h3", createdAt: 0 },
];

describe("semanticSearch", function () {
  it("should rank results by similarity", function () {
    const queryEmbedding = [1, 0];

    const results = semanticSearch(queryEmbedding, testChunks);

    assert.isArray(results);
    assert.isAtMost(results.length, 10);
    for (let i = 1; i < results.length; i++) {
      assert.isAtLeast(results[i - 1].similarity, results[i].similarity);
    }
  });
});
