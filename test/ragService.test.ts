import { assert } from "chai";
import { ask } from "../src/modules/ragService";
import type { SearchResult } from "../src/modules/searchService";

describe("ragService", function () {
  it("should return an object with answer and sources", async function () {
    this.timeout(30000);
    const result = await ask("hypothetical proteins and genome annotation");
    assert.isObject(result);
    assert.isString(result.answer);
    assert.isAbove(result.answer.length, 0);
    assert.isArray(result.sources);
  });

  it("should include at least one citation bracket in the answer when papers are indexed", async function () {
    this.timeout(30000);
    const result = await ask("community approach to protein function");
    if (result.answer.startsWith("No indexed papers")) {
      this.skip(); // no papers in the test library at this point
    }
    assert.match(
      result.answer,
      /\[.+\]/,
      "Expected at least one [Citation] in answer",
    );
  });

  it("sources should be SearchResult objects with title and similarity", async function () {
    this.timeout(30000);
    const result = await ask("protein annotation methods");
    if (result.sources.length === 0) return; // skip if no indexed papers
    const src = result.sources[0] as SearchResult;
    assert.isString(src.title);
    assert.isNumber(src.similarity);
    assert.isString(src.chunkText);
  });

  it("sources with a matching Zotero item should have itemId", async function () {
    this.timeout(30000);
    const result = await ask("protein annotation");
    if (result.sources.length === 0) return;
    const withId = result.sources.filter((s) => s.itemId != null);
    assert.isAbove(
      withId.length,
      0,
      "Expected at least one source to have an itemId",
    );
  });

  it("should return the no-papers message when nothing is indexed", async function () {
    this.skip();
  });

  it("should handle a German query and return a non-empty answer", async function () {
    this.timeout(30000);
    const result = await ask(
      "Was sind die Argumente für einen Community-Ansatz?",
    );
    assert.isString(result.answer);
    assert.isAbove(result.answer.length, 0);
    if (result.answer.startsWith("No indexed papers")) {
      this.skip();
    }
    // Response should contain German words (system prompt enforces English, but titles may be German)
    const lowerAnswer = result.answer.toLowerCase();
    const germanIndicators = [
      "die",
      "der",
      "das",
      "und",
      "für",
      "ist",
      "sind",
      "ein",
      "eine",
    ];
    const hasGerman = germanIndicators.some((word) =>
      lowerAnswer.includes(` ${word} `),
    );
    assert.isTrue(hasGerman, "Expected a German response");
  });
});
