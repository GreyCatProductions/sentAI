import { assert } from "chai";
import { chunkText } from "../src/modules/pdfIndexer";

// Two long sentences that comfortably pass the MIN_CHUNK_CHARS filter
const LONG =
  "This sentence is long enough to pass the minimum chunk length filter easily. " +
  "It contains enough prose to represent a real academic paragraph fragment.";

describe("chunkText", function () {
  it("should respect the token budget — no chunk exceeds maxTokens * 4 chars significantly", function () {
    const maxTokens = 50;
    // Build text with sentences well under and over budget
    const sentence =
      "This is a normal sentence that takes up a predictable number of tokens. ";
    const text = sentence.repeat(20);
    const chunks = chunkText(text, maxTokens);
    for (const chunk of chunks) {
      // Allow a single sentence overshoot (one sentence may exceed budget on its own)
      assert.isAtMost(chunk.length, maxTokens * 4 + 200);
    }
  });

  it("should not produce empty chunks", function () {
    const chunks = chunkText("  \n\n  \n\n  ");
    for (const chunk of chunks) {
      assert.isAbove(chunk.trim().length, 0);
    }
  });

  it("should drop chunks shorter than the minimum length", function () {
    const text = `${LONG}\n\n42\n\n${LONG}`;
    const chunks = chunkText(text);
    assert.isTrue(chunks.every((c) => c.trim().length >= 100));
  });

  it("should drop everything from the references section onward", function () {
    const marker = "Unique-marker-string-that-appears-only-after-references.";
    const chunks = chunkText(`${LONG}\n\nReferences\n\n${marker}`);
    assert.isTrue(chunks.every((c) => !c.includes("Unique-marker")));
  });

  it("should drop references section in German (Quellen)", function () {
    const chunks = chunkText(`${LONG}\n\nQuellen\n\n${LONG}`);
    assert.lengthOf(chunks, 1);
  });

  it("should drop boilerplate lines", function () {
    const text = `${LONG}\n\nAll rights reserved\n\n${LONG}`;
    const chunks = chunkText(text);
    assert.isTrue(chunks.every((c) => !/all rights reserved/i.test(c)));
  });

  it("should not split mid-sentence", function () {
    const s1 =
      "The first sentence ends here properly and has been made long enough to pass the minimum character filter.";
    const s2 =
      "The second sentence starts a new thought entirely and is also long enough to clear the minimum length check.";
    // maxTokens=30 forces a split between sentences; each sentence must remain intact
    const chunks = chunkText(`${s1} ${s2}`, 30);
    const joined = chunks.join(" ");
    assert.include(joined, s1);
    assert.include(joined, s2);
    // Neither sentence should be split across chunks
    for (const chunk of chunks) {
      assert.isFalse(chunk.startsWith("and has been made long enough"));
      assert.isFalse(chunk.startsWith("and is also long enough"));
    }
  });
});
