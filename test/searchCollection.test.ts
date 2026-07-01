import { assert } from "chai";
import { search } from "../src/modules/searchService";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

const ITEM_ML_ID = 77710;
const ITEM_QP_ID = 77711;
const COL_ML_ID  = 600;
const COL_QP_ID  = 601;

function makeFakeItem(id: number, key: string, title: string): Zotero.Item {
  return {
    id,
    key,
    getFilePathAsync: async () => "/fake/path.pdf",
    parentItem: null,
    getCreators: () => [],
    getField: (field: string) => (field === "title" ? title : ""),
  } as unknown as Zotero.Item;
}

async function indexFakeText(item: Zotero.Item, text: string) {
  const orig = Zotero.PDFWorker.getFullText;
  (Zotero.PDFWorker as any).getFullText = async () => ({ text });
  try {
    await PdfIndexer.process(item);
  } finally {
    Zotero.PDFWorker.getFullText = orig;
  }
}

describe("search — collection filter", function () {
  let origGetCol: typeof Zotero.Collections.get;

  before(async function () {
    this.timeout(60000);
    Zotero.Prefs.set("extensions.zotero.sentai.embeddingModel", "text-embedding-3-small", true);
    Zotero.Prefs.set("extensions.zotero.sentai.topK", 20, true);

    const mlText = Array(5)
      .fill("Machine learning and neural networks are used for pattern recognition and prediction tasks in data science.")
      .join("\n\n");
    const qpText = Array(5)
      .fill("Quantum physics describes wave-particle duality and superposition states in subatomic systems.")
      .join("\n\n");

    await indexFakeText(makeFakeItem(ITEM_ML_ID, "SCOL001", "ML Paper"), mlText);
    await indexFakeText(makeFakeItem(ITEM_QP_ID, "SCOL002", "QP Paper"), qpText);

    origGetCol = Zotero.Collections.get;
    (Zotero.Collections as any).get = (id: number) => {
      if (id === COL_ML_ID) return { getChildItems: () => [{ id: ITEM_ML_ID }] };
      if (id === COL_QP_ID) return { getChildItems: () => [{ id: ITEM_QP_ID }] };
      return origGetCol?.(id);
    };
  });

  after(async function () {
    Zotero.Prefs.set("extensions.zotero.sentai.topK", 5, true);
    await embeddingStorage.remove(ITEM_ML_ID);
    await embeddingStorage.remove(ITEM_QP_ID);
    (Zotero.Collections as any).get = origGetCol;
  });

  it("without collectionId returns results from the full index", async function () {
    this.timeout(15000);
    const results = await search("machine learning");
    assert.isArray(results);
    assert.isAbove(results.length, 0);
  });

  it("with collectionId only returns results from that collection's items", async function () {
    this.timeout(15000);
    const results = await search("machine learning quantum physics", { collectionId: COL_ML_ID });
    assert.isArray(results);
    for (const r of results) {
      assert.strictEqual(r.title, "ML Paper", `Got result from outside collection: "${r.title}"`);
    }
  });

  it("with QP collection only returns QP results", async function () {
    this.timeout(15000);
    const results = await search("machine learning quantum physics", { collectionId: COL_QP_ID });
    assert.isArray(results);
    for (const r of results) {
      assert.strictEqual(r.title, "QP Paper", `Got result from outside collection: "${r.title}"`);
    }
  });

  it("with empty collection returns empty array", async function () {
    this.timeout(10000);
    const EMPTY_COL = 999;
    const prev = Zotero.Collections.get;
    (Zotero.Collections as any).get = (id: number) => {
      if (id === EMPTY_COL) return { getChildItems: () => [] };
      return prev?.(id);
    };
    try {
      const results = await search("machine learning", { collectionId: EMPTY_COL });
      assert.deepEqual(results, []);
    } finally {
      (Zotero.Collections as any).get = prev;
    }
  });
});
