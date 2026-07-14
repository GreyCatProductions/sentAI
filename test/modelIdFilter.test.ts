import { assert } from "chai";
import { search } from "../src/modules/searchService";
import { embeddingStorage } from "../src/modules/savesystem";
import type { EmbeddingRecord } from "../src/types";

// Guards against comparing vectors from different embedding models — see
// the filter added to search() in searchService.ts.
describe("search — model_id filter", function () {
  const ITEM_ACTIVE_ID = 88901;
  const ITEM_STALE_ID = 88902;

  let origItemsGet: typeof Zotero.Items.get;
  let origGetByKey: typeof Zotero.Items.getByLibraryAndKey;

  const activeRecord: EmbeddingRecord = {
    paperId: "MODELFLT001",
    chunkIndex: 0,
    chunkText: "quantum entanglement subatomic wave-particle duality",
    embedding: [1, 0, 0],
    textHash: "hash-active",
    metadata: { title: "Active Model Paper" },
  };

  // Same direction as activeRecord so it would rank #1 if the filter didn't
  // exclude it — proves the exclusion is due to modelId, not similarity.
  const staleRecord: EmbeddingRecord = {
    paperId: "MODELFLT002",
    chunkIndex: 0,
    chunkText: "quantum entanglement subatomic wave-particle duality",
    embedding: [1, 0, 0],
    textHash: "hash-stale",
    metadata: { title: "Stale Model Paper" },
  };

  before(async function () {
    // embeddingStorage.save() always stamps model_id from the *currently
    // active* model pref, ignoring any modelId set on the record object —
    // so each save needs its own active-model pref value to land on disk.
    Zotero.Prefs.set(
      "extensions.zotero.sentai.embeddingModel",
      "text-embedding-3-large",
      true,
    );
    await embeddingStorage.save(ITEM_STALE_ID, [staleRecord]);

    Zotero.Prefs.set(
      "extensions.zotero.sentai.embeddingModel",
      "text-embedding-3-small",
      true,
    );
    await embeddingStorage.save(ITEM_ACTIVE_ID, [activeRecord]);

    origItemsGet = Zotero.Items.get;
    (Zotero.Items as any).get = () => false;
    origGetByKey = Zotero.Items.getByLibraryAndKey;
    (Zotero.Items as any).getByLibraryAndKey = () => false;
  });

  after(async function () {
    await embeddingStorage.remove(ITEM_ACTIVE_ID);
    await embeddingStorage.remove(ITEM_STALE_ID);
    (Zotero.Items as any).get = origItemsGet;
    (Zotero.Items as any).getByLibraryAndKey = origGetByKey;
  });

  it("excludes chunks embedded by a different model than the active one", async function () {
    this.timeout(15000);
    const results = await search("quantum entanglement");
    const titles = results.map((r) => r.title);
    assert.include(titles, "Active Model Paper");
    assert.notInclude(titles, "Stale Model Paper");
  });
});
