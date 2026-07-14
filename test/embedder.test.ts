import { assert } from "chai";
import { embedText } from "../src/modules/embedder";

describe("embedder", function () {
  it("should return embeddings from the server", async function () {
    this.timeout(15000);
    const embedding: number[] = await embedText("AI in corporate governance");
    assert.isArray(embedding);
    assert.isAbove(embedding.length, 0);
  });
});
