import { assert } from "chai";
import { embeddingStorage } from "../src/modules/savesystem";
import { EmbeddingRecord } from "../src/types";

describe("EmbeddingStorage", function () {
  const testItemId = 9999;
  const testItemId2 = 9998;

  // Use Float32-exact values so deepEqual holds after base64 round-trip
  const testRecords: EmbeddingRecord[] = [
    {
      paperId: "paper1",
      chunkIndex: 0,
      chunkText: "chunk1",
      embedding: [0.5, -0.5],
      textHash: "hash1",
    },
    {
      paperId: "paper1",
      chunkIndex: 1,
      chunkText: "chunk2",
      embedding: [0.25, -0.25],
      textHash: "hash2",
    },
  ];

  before(async function () {
    Zotero.Prefs.set(
      "extensions.zotero.sentai.embeddingModel",
      "text-embedding-3-small",
      true,
    );
    await embeddingStorage.init();
  });

  afterEach(async function () {
    await embeddingStorage.remove(testItemId);
    await embeddingStorage.remove(testItemId2);
  });

  it("should save and load records", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    const loaded = await embeddingStorage.load(testItemId);
    assert.deepEqual(loaded, testRecords);
  });

  it("should return undefined for a missing item", async function () {
    const loaded = await embeddingStorage.load(testItemId);
    assert.isUndefined(loaded);
  });

  it("should remove records for an item", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    await embeddingStorage.remove(testItemId);
    assert.isUndefined(await embeddingStorage.load(testItemId));
  });

  it("should replace chunks when re-indexing the same item", async function () {
    await embeddingStorage.save(testItemId, testRecords);

    const updated: EmbeddingRecord[] = [
      { ...testRecords[0], chunkText: "updated chunk", embedding: [1.0, 0.0] },
    ];
    await embeddingStorage.save(testItemId, updated);

    const loaded = await embeddingStorage.load(testItemId);
    assert.equal(loaded!.length, 1, "old chunks should be gone");
    assert.equal(loaded![0].chunkText, "updated chunk");
  });

  it("should preserve chunk order", async function () {
    // Insert in reverse order to confirm ORDER BY chunk_index applies
    const reversed = [...testRecords].reverse();
    await embeddingStorage.save(testItemId, reversed);
    const loaded = await embeddingStorage.load(testItemId);
    assert.equal(loaded![0].chunkIndex, 0);
    assert.equal(loaded![1].chunkIndex, 1);
  });

  it("should load all records across multiple items", async function () {
    const record2: EmbeddingRecord[] = [
      { ...testRecords[0], paperId: "paper2", chunkIndex: 0 },
    ];
    await embeddingStorage.save(testItemId, testRecords);
    await embeddingStorage.save(testItemId2, record2);

    const all = await embeddingStorage.loadAll();
    assert.isTrue(all.has(testItemId));
    assert.isTrue(all.has(testItemId2));
    assert.equal(all.get(testItemId)!.length, 2);
    assert.equal(all.get(testItemId2)!.length, 1);
  });

  it("should removeAll and return empty loadAll", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    await embeddingStorage.save(testItemId2, testRecords);
    await embeddingStorage.removeAll();

    const all = await embeddingStorage.loadAll();
    assert.equal(all.size, 0);
  });

  it("should preserve metadata fields", async function () {
    const withMeta: EmbeddingRecord[] = [
      {
        ...testRecords[0],
        metadata: {
          title: "Test Paper",
          authors: "Smith, J.; Doe, A.",
          year: "2024",
          abstract: "A test abstract.",
        },
      },
    ];
    await embeddingStorage.save(testItemId, withMeta);
    const loaded = await embeddingStorage.load(testItemId);
    assert.deepEqual(loaded![0].metadata, withMeta[0].metadata);
  });

  it("should return undefined metadata when none was stored", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    const loaded = await embeddingStorage.load(testItemId);
    assert.isUndefined(loaded![0].metadata);
  });

  // isIndexed
  it("should return false for an item that has not been indexed", async function () {
    assert.isFalse(await embeddingStorage.isIndexed(testItemId));
  });

  it("should return true for an item that has been indexed", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    assert.isTrue(await embeddingStorage.isIndexed(testItemId));
  });

  it("should return false after the item is removed", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    await embeddingStorage.remove(testItemId);
    assert.isFalse(await embeddingStorage.isIndexed(testItemId));
  });

  // loadByItemIds
  it("should return an empty map for an empty id list", async function () {
    const result = await embeddingStorage.loadByItemIds([]);
    assert.equal(result.size, 0);
  });

  it("should load only the requested item ids", async function () {
    const record2: EmbeddingRecord[] = [
      { ...testRecords[0], paperId: "paper2" },
    ];
    await embeddingStorage.save(testItemId, testRecords);
    await embeddingStorage.save(testItemId2, record2);

    const result = await embeddingStorage.loadByItemIds([testItemId]);
    assert.isTrue(result.has(testItemId));
    assert.isFalse(result.has(testItemId2));
    assert.deepEqual(result.get(testItemId), testRecords);
  });

  it("should silently omit ids that are not indexed", async function () {
    await embeddingStorage.save(testItemId, testRecords);
    const result = await embeddingStorage.loadByItemIds([testItemId, 1234567]);
    assert.isTrue(result.has(testItemId));
    assert.isFalse(result.has(1234567));
  });

  // close / re-init
  it("should close cleanly and allow re-init", async function () {
    await embeddingStorage.close();
    await embeddingStorage.init(); // re-attach so the rest of the suite keeps working
  });
});
