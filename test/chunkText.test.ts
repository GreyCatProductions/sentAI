import { assert } from "chai";
import { chunkText, PdfIndexer } from "../src/modules/pdfIndexer";

describe("chunkText", function () {
  it("should return a single chunk for short text", function () {
    const chunks = chunkText("Hello world");
    assert.lengthOf(chunks, 1);
    assert.equal(chunks[0], "Hello world");
  });

  //TODO: Diesen Test besprechen mit Chunking Verantwortlichen
  it.skip("should split on double newlines", function () {
    const text = "Para one.\n\nPara two.\n\nPara three.";
    const chunks = chunkText(text);
    assert.isAbove(chunks.length, 1);
  });

  it("should not exceed maxChunkSize", function () {
    const longPara = "a".repeat(600);
    const text = `${longPara}\n\n${longPara}\n\n${longPara}`;
    const chunks = chunkText(text, 1000);
    for (const chunk of chunks) {
      assert.isAtMost(chunk.length, 1000);
    }
  });

  it("should not produce empty chunks", function () {
    const chunks = chunkText("  \n\n  \n\n  ");
    for (const chunk of chunks) {
      assert.isAbove(chunk.trim().length, 0);
    }
  });
});