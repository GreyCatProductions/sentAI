import { assert } from "chai";
import { extractKeywords } from "../src/modules/keywordExtractor";

describe("extractKeywords", function () {
  let originalFetch: typeof globalThis.fetch;

  before(function () {
    originalFetch = globalThis.fetch;
  });

  afterEach(function () {
    globalThis.fetch = originalFetch;
  });

  it("returns a non-empty string for a valid query", async function () {
    this.timeout(15000);
    const result = await extractKeywords("What does Kant say about morality and ethics?");
    assert.isString(result);
    assert.isAbove(result.length, 0);
  });

  it("falls back to original query when fetch throws", async function () {
    (globalThis as any).fetch = async () => {
      throw new Error("network error");
    };
    const query = "fallback test query";
    const result = await extractKeywords(query);
    assert.strictEqual(result, query);
  });

  it("falls back to original query when response is not ok", async function () {
    (globalThis as any).fetch = async () => ({ ok: false, json: async () => ({}) });
    const query = "non-ok response fallback";
    const result = await extractKeywords(query);
    assert.strictEqual(result, query);
  });

  it("falls back to original query when response has no candidate text", async function () {
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    const query = "empty candidates fallback";
    const result = await extractKeywords(query);
    assert.strictEqual(result, query);
  });

  it("extracts keyword-like terms from a long question", async function () {
    this.timeout(15000);
    const query =
      "What are the main theoretical arguments for and against the use of neural networks in automated medical diagnosis systems?";
    const result = await extractKeywords(query);
    assert.isString(result);
    assert.isAbove(result.length, 0);
    // Should not return the full question verbatim
    assert.notEqual(result, query);
  });
});
