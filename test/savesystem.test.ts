import { assert } from "chai";
import { embeddingStorage } from "../src/modules/savesystem";

describe("EmbeddingStorage", function () {
  const testItemId = 9999;
  const testRecord = {
    paperId: "TEST_ID",
    chunkIndex: 0,
    chunkText: "hello_test",
    embedding: [0.1, 0.2],
    textHash: "abc_hash",
    createdAt: 0,
  };

  before(function () {
    embeddingStorage.ensureDir();
  });

  afterEach(async function () {
    await embeddingStorage.remove(testItemId);
  });

  it("should save and load a record", async function () {
    console.log("[savesystem] saving record...");
    await embeddingStorage.save(testItemId, testRecord);
    const loaded = await embeddingStorage.load(testItemId);
    console.log("[savesystem] loaded:", JSON.stringify(loaded));
    assert.deepEqual(loaded, testRecord);
  });

  it("should return undefined for a missing record", async function () {
    console.log("[savesystem] loading non-existent record...");
    const loaded = await embeddingStorage.load(testItemId);
    console.log("[savesystem] loaded:", loaded);
    assert.isUndefined(loaded);
  });

  it("should remove a record", async function () {
    console.log("[savesystem] saving then removing record...");
    await embeddingStorage.save(testItemId, testRecord);
    await embeddingStorage.remove(testItemId);
    const loaded = await embeddingStorage.load(testItemId);
    console.log("[savesystem] loaded after remove:", loaded);
    assert.isUndefined(loaded);
  });

  it("should load all stored records", async function () {
    console.log("[savesystem] saving and loading all records...");
    await embeddingStorage.save(testItemId, testRecord);
    const all = await embeddingStorage.loadAll();
    console.log("[savesystem] loadAll size:", all.size, "has testItemId:", all.has(testItemId));
    assert.isTrue(all.has(testItemId));
    assert.deepEqual(all.get(testItemId), testRecord);
  });
});
