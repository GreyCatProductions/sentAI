import { assert } from "chai";
import { search } from "../src/modules/searchService";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

const ITEM_ID = 99901;
const ITEM_KEY = "JUMP001";

function makeFakeParent(id: number, key: string, title: string): Zotero.Item {
  return {
    id,
    key,
    getFilePathAsync: async () => "/fake/path.pdf",
    parentItem: null,
    isAttachment: () => false,
    getCreators: () => [],
    getField: (f: string) => (f === "title" ? title : ""),
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

describe("openItem / itemId in search results", function () {
  let origGetByLibraryAndKey: typeof Zotero.Items.getByLibraryAndKey;

  before(async function () {
    this.timeout(30000);
    const text = Array(3)
      .fill(
        "Jump to paper navigation allows users to locate a paper in the Zotero library pane.",
      )
      .join("\n\n");
    await indexFakeText(makeFakeParent(ITEM_ID, ITEM_KEY, "Jump Paper"), text);

    origGetByLibraryAndKey = Zotero.Items.getByLibraryAndKey;
    (Zotero.Items as any).getByLibraryAndKey = (libId: number, key: string) => {
      if (key === ITEM_KEY)
        return makeFakeParent(ITEM_ID, ITEM_KEY, "Jump Paper");
      return origGetByLibraryAndKey?.(libId, key) ?? false;
    };
  });

  after(async function () {
    await embeddingStorage.remove(ITEM_ID);
    (Zotero.Items as any).getByLibraryAndKey = origGetByLibraryAndKey;
  });

  it("search results include itemId when Zotero item exists", async function () {
    this.timeout(15000);
    const results = await search("jump to paper library navigation");
    assert.isArray(results);
    assert.isAbove(results.length, 0);
    const withId = results.filter((r) => r.itemId != null);
    assert.isAbove(
      withId.length,
      0,
      "Expected at least one result with itemId",
    );
    assert.strictEqual(withId[0].itemId, ITEM_ID);
  });

  it("search results have itemId as a number", async function () {
    this.timeout(15000);
    const results = await search("jump to paper library navigation");
    for (const r of results) {
      if (r.itemId != null) {
        assert.isNumber(r.itemId);
      }
    }
  });

  it("api.openItem() calls ZoteroPane.selectItem with the given id", function () {
    const api = (Zotero as any).SentAI.api as {
      openItem: (id: number) => void;
    };
    let calledWith: number | undefined;

    const mainWin = Zotero.getMainWindow() as any;
    const origSelectItem = mainWin?.ZoteroPane?.selectItem;
    if (mainWin?.ZoteroPane) {
      mainWin.ZoteroPane.selectItem = (id: number) => {
        calledWith = id;
      };
    }

    try {
      api.openItem(ITEM_ID);
      assert.strictEqual(calledWith, ITEM_ID);
    } finally {
      if (mainWin?.ZoteroPane && origSelectItem) {
        mainWin.ZoteroPane.selectItem = origSelectItem;
      }
    }
  });

  it("itemId is undefined for results whose key is not found in Zotero", async function () {
    this.timeout(15000);
    const prev = Zotero.Items.getByLibraryAndKey;
    (Zotero.Items as any).getByLibraryAndKey = () => false;
    try {
      const results = await search("jump to paper library");
      for (const r of results) {
        assert.isUndefined(r.itemId);
      }
    } finally {
      (Zotero.Items as any).getByLibraryAndKey = prev;
    }
  });
});
