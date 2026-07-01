import { assert } from "chai";
import { search } from "../src/modules/searchService";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";

const ITEM_ML_ID  = 88801; // tag:"gelesen"  | journalArticle | 2022
const ITEM_QP_ID  = 88802; // tag:"wichtig"  | thesis         | 2019
const ITEM_BIO_ID = 88803; // no tags        | book           | 2023

interface FakeOpts {
  title?: string;
  tags?: string[];
  itemType?: string;
  date?: string;
}

function makeFakeItem(id: number, key: string, opts: FakeOpts = {}): Zotero.Item {
  return {
    id,
    key,
    isAttachment: () => false,
    parentItem: null,
    getFilePathAsync: async () => "/fake/path.pdf",
    getCreators: () => [],
    getTags: () => (opts.tags ?? []).map((tag) => ({ tag, type: 0 })),
    itemType: opts.itemType ?? "journalArticle",
    getField: (field: string) => {
      if (field === "title") return opts.title ?? key;
      if (field === "date") return opts.date ?? "";
      return "";
    },
  } as unknown as Zotero.Item;
}

const fakeML  = makeFakeItem(ITEM_ML_ID,  "SFLT001", { title: "ML Paper",  tags: ["gelesen"], itemType: "journalArticle", date: "2022-03-01" });
const fakeQP  = makeFakeItem(ITEM_QP_ID,  "SFLT002", { title: "QP Paper",  tags: ["wichtig"], itemType: "thesis",         date: "2019-07-15" });
const fakeBio = makeFakeItem(ITEM_BIO_ID, "SFLT003", { title: "Bio Paper", tags: [],          itemType: "book",           date: "2023-01-20" });

const fakeMap = new Map<number, Zotero.Item>([
  [ITEM_ML_ID,  fakeML],
  [ITEM_QP_ID,  fakeQP],
  [ITEM_BIO_ID, fakeBio],
]);

async function indexFakeText(item: Zotero.Item, text: string) {
  const orig = Zotero.PDFWorker.getFullText;
  (Zotero.PDFWorker as any).getFullText = async () => ({ text });
  try {
    await PdfIndexer.process(item);
  } finally {
    Zotero.PDFWorker.getFullText = orig;
  }
}

describe("search — tag, year, and itemType filters", function () {
  let origItemsGet: typeof Zotero.Items.get;
  let origGetByKey: typeof Zotero.Items.getByLibraryAndKey;

  before(async function () {
    this.timeout(60000);
    Zotero.Prefs.set("extensions.zotero.sentai.embeddingModel", "text-embedding-3-small", true);
    Zotero.Prefs.set("extensions.zotero.sentai.topK", 20, true);

    const mlText  = Array(5).fill("Machine learning neural networks deep learning gradient descent backpropagation classification.").join("\n\n");
    const qpText  = Array(5).fill("Quantum physics wave-particle duality Schrödinger equation subatomic entanglement superposition.").join("\n\n");
    const bioText = Array(5).fill("Biology genetics DNA replication cell division organisms evolution protein synthesis chromosomes.").join("\n\n");

    await indexFakeText(fakeML,  mlText);
    await indexFakeText(fakeQP,  qpText);
    await indexFakeText(fakeBio, bioText);

    origItemsGet = Zotero.Items.get;
    (Zotero.Items as any).get = (id: number) => fakeMap.get(id) ?? false;

    origGetByKey = Zotero.Items.getByLibraryAndKey;
    (Zotero.Items as any).getByLibraryAndKey = (_libId: number, key: string) => {
      for (const item of fakeMap.values()) {
        if ((item as any).key === key) return item;
      }
      return false;
    };
  });

  after(async function () {
    Zotero.Prefs.set("extensions.zotero.sentai.topK", 5, true);
    await embeddingStorage.remove(ITEM_ML_ID);
    await embeddingStorage.remove(ITEM_QP_ID);
    await embeddingStorage.remove(ITEM_BIO_ID);
    (Zotero.Items as any).get = origItemsGet;
    (Zotero.Items as any).getByLibraryAndKey = origGetByKey;
  });

  // ===== Baseline =====
  it("no filters: returns results from all indexed items", async function () {
    this.timeout(15000);
    const results = await search("machine learning quantum biology");
    assert.isArray(results);
    assert.isAbove(results.length, 0);
  });

  // ===== Tag filter =====
  it("tag filter: only returns items with the given tag", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { tags: ["gelesen"] });
    assert.isAbove(results.length, 0);
    for (const r of results) {
      assert.strictEqual(r.title, "ML Paper", `Unexpected result: "${r.title}"`);
    }
  });

  it("tag filter: OR logic — item matching any selected tag is included", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { tags: ["gelesen", "wichtig"] });
    assert.isAbove(results.length, 0);
    for (const r of results) {
      assert.include(["ML Paper", "QP Paper"], r.title, `Unexpected result: "${r.title}"`);
    }
  });

  it("tag filter: item with no tags is excluded when filter is active", async function () {
    this.timeout(15000);
    const results = await search("biology genetics research", { tags: ["gelesen"] });
    for (const r of results) {
      assert.notEqual(r.title, "Bio Paper", "Bio Paper (no tags) must be excluded");
    }
  });

  it("tag filter: non-existent tag returns empty array", async function () {
    this.timeout(10000);
    const results = await search("research", { tags: ["__nonexistent__"] });
    assert.deepEqual(results, []);
  });

  // ===== Year filter =====
  it("yearFrom: excludes items published before the threshold", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { yearFrom: 2021 });
    for (const r of results) {
      assert.notEqual(r.title, "QP Paper", "QP Paper (2019) must be excluded by yearFrom:2021");
    }
  });

  it("yearTo: excludes items published after the threshold", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { yearTo: 2020 });
    for (const r of results) {
      assert.notEqual(r.title, "ML Paper",  "ML Paper (2022) must be excluded by yearTo:2020");
      assert.notEqual(r.title, "Bio Paper", "Bio Paper (2023) must be excluded by yearTo:2020");
    }
  });

  it("yearFrom + yearTo: only items within the range are returned", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { yearFrom: 2021, yearTo: 2022 });
    assert.isAbove(results.length, 0);
    for (const r of results) {
      assert.strictEqual(r.title, "ML Paper", `Only ML Paper (2022) fits 2021–2022, got: "${r.title}"`);
    }
  });

  it("year range with no matching items returns empty array", async function () {
    this.timeout(10000);
    const results = await search("research", { yearFrom: 2000, yearTo: 2010 });
    assert.deepEqual(results, []);
  });

  // ===== itemType filter =====
  it("itemType: only returns items of the specified type", async function () {
    this.timeout(15000);
    const results = await search("research study analysis", { itemType: "thesis" });
    assert.isAbove(results.length, 0);
    for (const r of results) {
      assert.strictEqual(r.title, "QP Paper", `Only QP Paper (thesis) expected, got: "${r.title}"`);
    }
  });

  it("itemType: unknown type returns empty array", async function () {
    this.timeout(10000);
    const results = await search("research", { itemType: "patent" });
    assert.deepEqual(results, []);
  });

  // ===== Combined filters (AND) =====
  it("tag + itemType AND: item must satisfy both conditions", async function () {
    this.timeout(15000);
    const results = await search("research study", { tags: ["gelesen"], itemType: "journalArticle" });
    assert.isAbove(results.length, 0);
    for (const r of results) {
      assert.strictEqual(r.title, "ML Paper");
    }
  });

  it("tag + year AND: tag matches but year excludes → empty", async function () {
    this.timeout(10000);
    // "gelesen" = ML Paper (2022), yearTo:2020 excludes 2022
    const results = await search("research", { tags: ["gelesen"], yearTo: 2020 });
    assert.deepEqual(results, []);
  });

  it("collectionId + tag: both restrictions apply simultaneously", async function () {
    this.timeout(15000);
    const COL_MIXED = 700;
    const origGet = Zotero.Collections.get;
    (Zotero.Collections as any).get = (id: number) => {
      if (id === COL_MIXED)
        return { getChildItems: () => [{ id: ITEM_ML_ID }, { id: ITEM_QP_ID }] };
      return origGet?.(id);
    };
    try {
      // Collection has ML + QP; tag:"wichtig" narrows to QP only
      const results = await search("research study", { collectionId: COL_MIXED, tags: ["wichtig"] });
      assert.isAbove(results.length, 0);
      for (const r of results) {
        assert.strictEqual(r.title, "QP Paper");
      }
    } finally {
      (Zotero.Collections as any).get = origGet;
    }
  });
});
