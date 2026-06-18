import { assert } from "chai";
import { ask } from "../src/modules/ragService";

describe("ragService", function () {
  it("should return a non-empty string for a valid query", async function () {
    this.timeout(30000);
    const result = await ask("hypothetical proteins and genome annotation");
    assert.isString(result);
    assert.isAbove(result.length, 0);
  });

  it("should include at least one citation bracket in the response when papers are indexed", async function () {
    this.timeout(30000);
    const result = await ask("community approach to protein function");
    assert.isString(result);
    // Response should contain [Paper Title] citations
    assert.match(result, /\[.+\]/, "Expected at least one [Citation] in response");
  });

  it("should return the no-papers message when nothing is indexed", async function () {
    // This test only passes when the DB is empty — skip in normal runs
    // Kept as documentation of the expected fallback behaviour
    this.skip();
  });

  it("should handle a German query and respond in German", async function () {
    this.timeout(30000);
    const result = await ask("Was sind die Argumente für einen Community-Ansatz?");
    assert.isString(result);
    assert.isAbove(result.length, 0);
    // Response should be in German — check for common German words
    const germanIndicators = ["die", "der", "das", "und", "für", "ist", "sind", "ein", "eine"];
    const lowerResult = result.toLowerCase();
    const hasGerman = germanIndicators.some(word => lowerResult.includes(` ${word} `));
    assert.isTrue(hasGerman, "Expected a German response");
  });
});
