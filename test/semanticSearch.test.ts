import { assert } from "chai";
import {
  semanticSearch,
  semanticSearchByPaper,
} from "../src/modules/semanticSearch";
import type { EmbeddingRecord } from "../src/types";

const testChunks: EmbeddingRecord[] = [
  {
    paperId: "A",
    chunkIndex: 0,
    chunkText: "foo",
    embedding: [1, 0],
    textHash: "h1",
  },
  {
    paperId: "B",
    chunkIndex: 0,
    chunkText: "bar",
    embedding: [0, 1],
    textHash: "h2",
  },
  {
    paperId: "C",
    chunkIndex: 0,
    chunkText: "baz",
    embedding: [1, 1],
    textHash: "h3",
  },
];

// A paper with many strongly-matching body chunks that would otherwise
// monopolise a flat top-K, plus a second paper with a single decent chunk.
function body(
  paperId: string,
  chunkIndex: number,
  embedding: number[],
): EmbeddingRecord {
  return {
    paperId,
    chunkIndex,
    chunkText: `${paperId}-${chunkIndex}`,
    chunkKind: "body",
    embedding,
    textHash: `${paperId}-${chunkIndex}`,
  };
}

describe("semanticSearch module", function () {
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

  describe("semanticSearchByPaper", function () {
    it("spans distinct papers instead of one paper's chunks", function () {
      const query = [1, 0];
      // Paper A: five near-identical body chunks that dominate a flat ranking.
      const chunks: EmbeddingRecord[] = [
        body("A", 0, [1, 0]),
        body("A", 1, [0.99, 0.01]),
        body("A", 2, [0.98, 0.02]),
        body("A", 3, [0.97, 0.03]),
        body("A", 4, [0.96, 0.04]),
        // Paper B: one weaker but still relevant chunk.
        body("B", 0, [0.8, 0.2]),
      ];

      const flat = semanticSearch(query, chunks, 5);
      assert.deepEqual(
        Array.from(new Set(flat.map((r) => r.paperId))),
        ["A"],
        "flat top-5 is monopolised by paper A",
      );

      const diversified = semanticSearchByPaper(query, chunks, {
        topPapers: 5,
        perPaper: 2,
      });
      const papers = new Set(diversified.map((r) => r.paperId));
      assert.isTrue(
        papers.has("A") && papers.has("B"),
        "should include both papers",
      );
    });

    it("caps chunks per paper at perPaper", function () {
      const query = [1, 0];
      const chunks = [0, 1, 2, 3].map((i) => body("A", i, [1, 0]));

      const diversified = semanticSearchByPaper(query, chunks, {
        topPapers: 5,
        perPaper: 2,
      });
      assert.lengthOf(diversified, 2);
    });

    it("ranks a paper by its abstract chunk", function () {
      const query = [0, 1];
      const abstractMatch: EmbeddingRecord = {
        paperId: "A",
        chunkIndex: 0,
        chunkText: "abstract of A",
        chunkKind: "abstract",
        embedding: [0, 1], // perfect match to the query
        textHash: "a-abs",
      };
      const chunks: EmbeddingRecord[] = [
        abstractMatch,
        body("A", 1, [1, 0]), // A's body is unrelated to the query
        body("B", 0, [0.5, 0.5]), // B has only a mediocre body chunk
      ];

      const diversified = semanticSearchByPaper(query, chunks, {
        topPapers: 1,
        perPaper: 2,
      });
      // Paper A wins on its abstract even though its body chunk is a poor match.
      assert.isTrue(diversified.every((r) => r.paperId === "A"));
      // Body chunks are preferred for the returned context.
      assert.isTrue(diversified.some((r) => r.chunkKind === "body"));
    });
  });
});
