import { assert } from "chai";
import { ask } from "../src/modules/ragService";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

const ITEM_ID = 88884;

const sentaiApi = () =>
  (Zotero as any).SentAI.api as {
    getPref: (key: string) => unknown;
    setPref: (key: string, value: unknown) => void;
  };

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
    const text = Array(4)
      .fill(
        "Similarity thresholds filter search results based on cosine distance between embeddings.",
      )
      .join("\n\n");
    await indexFakeText(makeFakeItem(ITEM_ID, "MSIM001"), text);
  });

  after(async function () {
    sentaiApi().setPref("minSimilarity", 10);
    await embeddingStorage.remove(ITEM_ID);
  });

  it("minSimilarity=101 filters all chunks — ask returns threshold message", async function () {
    this.timeout(30000);
    sentaiApi().setPref("minSimilarity", 101);
    const result = await ask("similarity thresholds cosine distance");
    assert.deepEqual(result.sources, []);
    assert.include(result.answer, "101%");
  });

  it("minSimilarity=0 passes all chunks — ask returns a generated answer with sources", async function () {
    this.timeout(30000);
    sentaiApi().setPref("minSimilarity", 0);
    const result = await ask("similarity thresholds cosine distance");
    assert.isString(result.answer);
    assert.isAbove(result.answer.length, 0);
    assert.notInclude(result.answer, "No sufficiently relevant");
    assert.notInclude(result.answer, "No indexed papers");
    assert.isArray(result.sources);
    assert.isAbove(result.sources.length, 0);
  });

  it("read-back: getPref returns the value that was set", function () {
    sentaiApi().setPref("minSimilarity", 42);
    const val = sentaiApi().getPref("minSimilarity") as number;
    assert.strictEqual(val, 42);
    sentaiApi().setPref("minSimilarity", 10);
  });
});
