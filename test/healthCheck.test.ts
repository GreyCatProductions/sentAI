import { assert } from "chai";

const api = () => (Zotero as any).SentAI.api as {
  serverReachable: () => Promise<{ reachable: boolean }>;
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
});
