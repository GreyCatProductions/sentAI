import { assert } from "chai";
import { chunkText, PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

describe("PdfIndexer", function () {
  const fakeItemId = 99998;

  before(function () {
    Zotero.Prefs.set(
      "extensions.zotero.sentai.embeddingModel",
      "text-embedding-3-small",
      true,
    );
  });

  afterEach(async function () {
    await embeddingStorage.remove(fakeItemId);
  });

  it("should embed chunks and save records", async function () {
    this.timeout(30000);

    const fakeText =
      "This is the first paragraph about machine learning.\n\nThis is the second paragraph about neural networks.";

    const fakeItem = {
      id: fakeItemId,
      key: "FAKEKEY1",
      getFilePathAsync: async () => "/fake/path.pdf",
      parentItem: null,
      getCreators: () => [],
      getField: (_field: string) => "",
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

  it("should replace chunks when re-indexed with changed content", async function () {
    this.timeout(30000);

    const originalText =
      "This is the original paragraph about machine learning and how neural networks can be used to classify images and predict outcomes in complex datasets.";
    const changedText =
      "This is a completely different paragraph about quantum physics and how entanglement enables faster-than-classical information processing in certain computational models.";

    const fakeItem = {
      id: fakeItemId,
      key: "FAKEKEY2",
      getFilePathAsync: async () => "/fake/path.pdf",
      parentItem: null,
      getCreators: () => [],
      getField: (_field: string) => "",
    } as unknown as Zotero.Item;

    const original = Zotero.PDFWorker.getFullText;

    try {
      (Zotero.PDFWorker as any).getFullText = async () => ({
        text: originalText,
      });
      await PdfIndexer.process(fakeItem);
      const firstSave = await embeddingStorage.load(fakeItemId);

      (Zotero.PDFWorker as any).getFullText = async () => ({
        text: changedText,
      });
      await PdfIndexer.process(fakeItem);
      const secondSave = await embeddingStorage.load(fakeItemId);

      assert.isArray(firstSave);
      assert.isArray(secondSave);
      assert.notEqual(firstSave![0].chunkText, secondSave![0].chunkText);
      assert.notEqual(firstSave![0].textHash, secondSave![0].textHash);
    } finally {
      Zotero.PDFWorker.getFullText = original;
    }
  });

  it("should produce identical records when re-indexed with unchanged content", async function () {
    this.timeout(30000);

    const text =
      "This is a stable paragraph about neural networks and deep learning architectures that remain consistent across multiple indexing runs without any modification.";

    const fakeItem = {
      id: fakeItemId,
      key: "FAKEKEY3",
      getFilePathAsync: async () => "/fake/path.pdf",
      parentItem: null,
      getCreators: () => [],
      getField: (_field: string) => "",
    } as unknown as Zotero.Item;

    const original = Zotero.PDFWorker.getFullText;
    (Zotero.PDFWorker as any).getFullText = async () => ({ text });

    try {
      await PdfIndexer.process(fakeItem);
      const firstSave = await embeddingStorage.load(fakeItemId);

      await PdfIndexer.process(fakeItem);
      const secondSave = await embeddingStorage.load(fakeItemId);

      assert.equal(firstSave![0].chunkText, secondSave![0].chunkText);
      assert.equal(firstSave![0].textHash, secondSave![0].textHash);
      assert.equal(firstSave!.length, secondSave!.length);
    } finally {
      Zotero.PDFWorker.getFullText = original;
    }
  });
});
