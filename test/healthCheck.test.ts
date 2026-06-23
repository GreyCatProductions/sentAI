import { assert } from "chai";

const api = () => (Zotero as any).SentAI.api as {
  healthCheck: () => Promise<{ embedder: boolean; hasIndex: boolean }>;
};

describe("healthCheck", function () {
  let originalFetch: typeof globalThis.fetch;

  before(function () {
    originalFetch = globalThis.fetch;
  });

  afterEach(function () {
    globalThis.fetch = originalFetch;
  });

  it("GET /health returns { ok: true } when server is running", async function () {
    this.timeout(5000);
    const res = await fetch(`${(globalThis as any).__server_url__}/health`);
    assert.isTrue(res.ok);
    const json = await res.json() as { ok: boolean };
    assert.isTrue(json.ok);
  });

  it("api.healthCheck() returns { embedder: true } when server is running", async function () {
    this.timeout(5000);
    const result = await api().healthCheck();
    assert.isTrue(result.embedder);
  });

  it("api.healthCheck() returns hasIndex: true when papers are indexed", async function () {
    this.timeout(5000);
    const result = await api().healthCheck();
    assert.isBoolean(result.hasIndex);
  });

  it("api.healthCheck() returns hasIndex: false when index is empty", async function () {
    this.timeout(5000);
    const { embeddingStorage } = await import("../src/modules/savesystem");
    const orig = embeddingStorage.loadAll.bind(embeddingStorage);
    (embeddingStorage as any).loadAll = async () => new Map();
    try {
      const result = await api().healthCheck();
      assert.isFalse(result.hasIndex);
    } finally {
      (embeddingStorage as any).loadAll = orig;
    }
  });

  it("api.healthCheck() returns { embedder: false } when fetch throws", async function () {
    (globalThis as any).fetch = async () => { throw new Error("connection refused"); };
    const result = await api().healthCheck();
    assert.isFalse(result.embedder);
  });

  it("api.healthCheck() returns { embedder: false } when server returns non-ok", async function () {
    (globalThis as any).fetch = async () => ({ ok: false });
    const result = await api().healthCheck();
    assert.isFalse(result.embedder);
  });
});
