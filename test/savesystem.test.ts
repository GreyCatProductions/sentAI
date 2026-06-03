import { assert } from "chai";
import { embeddingStorage } from "../src/modules/savesystem";
import { EmbeddingRecord } from "../src/types";

describe("EmbeddingStorage", function () {
  const testItemId = 9999;
  const testRecord: EmbeddingRecord[] = [
    {
      paperId: "paper1",
      chunkIndex: 0,
      chunkText: "chunk1",
      embedding: [0.1, 0.2],
      textHash: "hash1",
      createdAt: 0,
    },
    {
      paperId: "paper1",
      chunkIndex: 1,
      chunkText: "chunk2",
      embedding: [0.3, 0.4],
      textHash: "hash2",
      createdAt: 0,
    }
  ];

  before(function () {
    embeddingStorage.ensureDir();
  });

  afterEach(async function () {
    await embeddingStorage.remove(testItemId);
  });

  it("should save and load a record", async function () {
    await embeddingStorage.save(testItemId, testRecord);
    const loaded = await embeddingStorage.load(testItemId);
    assert.deepEqual(loaded, testRecord);
  });

  it("should return undefined for a missing record", async function () {
    const loaded = await embeddingStorage.load(testItemId);
    assert.isUndefined(loaded);
  });

  it("should remove a record", async function () {
    await embeddingStorage.save(testItemId, testRecord);
    await embeddingStorage.remove(testItemId);
    const loaded = await embeddingStorage.load(testItemId);
    assert.isUndefined(loaded);
  });

  it("should load all stored records", async function () {
    await embeddingStorage.save(testItemId, testRecord);
    const all = await embeddingStorage.loadAll();
    assert.isTrue(all.has(testItemId));
    assert.deepEqual(all.get(testItemId), testRecord);
  });
});
