import { assert } from "chai";
import { chunkText, PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

describe("chunkText", function () {
  it("should return a single chunk for short text", function () {
    const chunks = chunkText("Hello world");
    assert.lengthOf(chunks, 1);
    assert.equal(chunks[0], "Hello world");
  });

  it("should split on double newlines", function () {
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

describe("PdfIndexer", function () {
  const fakeItemId = 99998;

  afterEach(async function () {
    await embeddingStorage.remove(fakeItemId);
  });

  it("should embed chunks and save records", async function () {
    this.timeout(30000);

    const fakeText = "This is the first paragraph about machine learning.\n\nThis is the second paragraph about neural networks.";

    const fakeItem = {
      id: fakeItemId,
      key: "FAKEKEY1",
      getFilePathAsync: async () => "/fake/path.pdf",
    } as unknown as Zotero.Item;

    // Stub PDFWorker to avoid needing a real PDF
    const original = Zotero.PDFWorker.getFullText;
    (Zotero.PDFWorker as any).getFullText = async () => ({ text: fakeText });

    try {
      await PdfIndexer.process(fakeItem);
    } finally {
      Zotero.PDFWorker.getFullText = original;
    }

    const saved = await embeddingStorage.load(fakeItemId);
    assert.isArray(saved);
    assert.isAbove(saved!.length, 0);
    assert.equal(saved![0].paperId, "FAKEKEY1");
    assert.isArray(saved![0].embedding);
    assert.isAbove(saved![0].embedding.length, 0);
  });
});
