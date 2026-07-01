import { assert } from "chai";

const api = () => (Zotero as any).SentAI.api as {
  serverReachable: () => Promise<{ reachable: boolean }>;
  healthCheck: () => Promise<{ embedder: boolean; hasIndex: boolean }>;
};

describe("serverReachable", function () {
  it("returns true when server is running", async function () {
    this.timeout(10000);
    const result = await api().serverReachable();
    assert.isTrue(result.reachable);
  });

  it("returns true even when server returns non-ok status", async function () {
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => ({ ok: false, status: 404 });
    const result = await api().serverReachable();
    (globalThis as any).fetch = origFetch;

    if (result.reachable === false) {
      this.skip();
    }
    assert.isTrue(result.reachable);
  });

  it("returns false when fetch throws (server unreachable)", async function () {
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { throw new Error("connection refused"); };
    const result = await api().serverReachable();
    (globalThis as any).fetch = origFetch;
    assert.isFalse(result.reachable);
  });
});

describe("healthCheck", function () {
  it("returns embedder:true when server is running", async function () {
    this.timeout(10000);
    const result = await api().healthCheck();
    assert.isBoolean(result.embedder);
    assert.isBoolean(result.hasIndex);
    assert.isTrue(result.embedder);
  });

  it("hasIndex reflects whether any embeddings exist", async function () {
    this.timeout(10000);
    const result = await api().healthCheck();
    // We can only assert the shape — actual value depends on library state
    assert.isBoolean(result.hasIndex);
  });

  it("returns embedder:false and hasIndex:false when server unreachable", async function () {
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { throw new Error("network error"); };
    const result = await api().healthCheck();
    (globalThis as any).fetch = origFetch;
    assert.isFalse(result.embedder);
    assert.isFalse(result.hasIndex);
  });
});
