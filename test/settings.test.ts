import { assert } from "chai";
import { PdfIndexer } from "../src/modules/pdfIndexer";
import { embeddingStorage } from "../src/modules/savesystem";
import { search } from "../src/modules/searchService";

const CHUNK_ITEM_ID = 88881;
const TOPK_ITEM_ID = 88882;

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

describe("settings prefs", function () {
  before(function () {
    Zotero.Prefs.set(
      "extensions.zotero.sentai.embeddingModel",
      "text-embedding-3-small",
      true,
    );
  });

  // ── maxChunkTokens ──────────────────────────────────────────────────────────

  describe("maxChunkTokens pref", function () {
    before(function () {
      Zotero.Prefs.set("extensions.zotero.sentai.maxChunkTokens", 50, true);
    });

    after(async function () {
      Zotero.Prefs.set("extensions.zotero.sentai.maxChunkTokens", 500, true);
      await embeddingStorage.remove(CHUNK_ITEM_ID);
    });

    it("PdfIndexer.process uses maxChunkTokens pref to limit chunk size", async function () {
      this.timeout(30000);

      // Long repeated sentence → would form huge chunks at 500 tokens, tiny at 50
      const sentence =
        "This academic sentence is deliberately long enough to exceed a fifty token budget " +
        "and force a chunk boundary to be created between consecutive sentences in the output.";
      const text = Array(15).fill(sentence).join(" ");

      await indexFakeText(makeFakeItem(CHUNK_ITEM_ID, "SETT001"), text);

      const saved = await embeddingStorage.load(CHUNK_ITEM_ID);
      assert.isArray(saved);
      assert.isAbove(saved!.length, 0);

      // 50 tokens × 4 chars/token + one-sentence overshoot tolerance
      for (const r of saved!) {
        assert.isAtMost(
          r.chunkText.length,
          50 * 4 + 300,
          `chunk "${r.chunkText.slice(0, 40)}…" exceeds 50-token budget`,
        );
      }
    });
  });

  // ── topK ────────────────────────────────────────────────────────────────────

  describe("topK pref", function () {
    before(async function () {
      this.timeout(30000);

      // 6 distinct paragraphs → at least 6 chunks in storage
      const paragraphs = [
        "Machine learning models use gradient descent to minimise a loss function during training on large datasets.",
        "Neural networks learn hierarchical representations of data through layered non-linear transformations.",
        "Transformer architectures rely on self-attention mechanisms to model long-range token dependencies.",
        "Convolutional networks exploit spatial locality to reduce parameter count in image classification tasks.",
        "Recurrent networks process sequential data but historically suffered from vanishing gradient problems.",
        "Reinforcement learning agents maximise cumulative reward signals through iterative environment interaction.",
      ];

      await indexFakeText(
        makeFakeItem(TOPK_ITEM_ID, "SETT002"),
        paragraphs.join("\n\n"),
      );
    });

    after(async function () {
      Zotero.Prefs.set("extensions.zotero.sentai.topK", 5, true);
      await embeddingStorage.remove(TOPK_ITEM_ID);
    });

    it("search returns at most 1 result when topK=1", async function () {
      this.timeout(10000);
      Zotero.Prefs.set("extensions.zotero.sentai.topK", 1, true);
      const results = await search("machine learning");
      assert.isAtMost(results.length, 1);
    });

    it("search returns at most 3 results when topK=3", async function () {
      this.timeout(10000);
      Zotero.Prefs.set("extensions.zotero.sentai.topK", 3, true);
      const results = await search("neural networks");
      assert.isAtMost(results.length, 3);
    });

    it("lower topK yields no more results than higher topK", async function () {
      this.timeout(15000);
      Zotero.Prefs.set("extensions.zotero.sentai.topK", 2, true);
      const r2 = await search("transformer attention");

      Zotero.Prefs.set("extensions.zotero.sentai.topK", 5, true);
      const r5 = await search("transformer attention");

      assert.isAtMost(r2.length, 2);
      assert.isAtMost(r5.length, 5);
      assert.isAtLeast(r5.length, r2.length);
    });
  });
});
