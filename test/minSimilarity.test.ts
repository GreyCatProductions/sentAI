import { assert } from "chai";
import { ask } from "../src/modules/ragService";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

const ITEM_ID = 88884;

function makeFakeItem(id: number, key: string): Zotero.Item {
  return {
    id,
    key,
    getFilePathAsync: async () => "/fake/path.pdf",
    parentItem: null,
    getCreators: () => [],
    getField: (_: string) => "",
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

describe("minSimilarity pref", function () {
  before(async function () {
    this.timeout(30000);
    Zotero.Prefs.set("extensions.zotero.sentai.embeddingModel", "text-embedding-3-small", true);
    const text = Array(4)
      .fill("Similarity thresholds filter search results based on cosine distance between embeddings.")
      .join("\n\n");
    await indexFakeText(makeFakeItem(ITEM_ID, "MSIM001"), text);
  });

  after(async function () {
    Zotero.Prefs.set("extensions.zotero.sentai.minSimilarity", 10, true);
    await embeddingStorage.remove(ITEM_ID);
  });

  it("minSimilarity=101 filters all chunks — ask returns threshold message", async function () {
    this.timeout(30000);
    // 101 → threshold = 1.01, above the maximum possible cosine similarity of 1.0
    Zotero.Prefs.set("extensions.zotero.sentai.minSimilarity", 101, true);
    const result = await ask("similarity thresholds cosine distance");
    assert.include(result, "No sufficiently relevant results found");
  });

  it("minSimilarity=0 passes all chunks — ask returns a generated answer", async function () {
    this.timeout(30000);
    Zotero.Prefs.set("extensions.zotero.sentai.minSimilarity", 0, true);
    const result = await ask("similarity thresholds cosine distance");
    assert.isString(result);
    assert.isAbove(result.length, 0);
    assert.notInclude(result, "No sufficiently relevant");
    assert.notInclude(result, "No indexed papers");
  });

  it("read-back: getPref returns the value that was set", function () {
    Zotero.Prefs.set("extensions.zotero.sentai.minSimilarity", 42, true);
    const val = Zotero.Prefs.get("extensions.zotero.sentai.minSimilarity", true) as number;
    assert.strictEqual(val, 42);
    Zotero.Prefs.set("extensions.zotero.sentai.minSimilarity", 10, true);
  });
});
