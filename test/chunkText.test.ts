import { assert } from "chai";
import { chunkText, PdfIndexer } from "../src/modules/pdfIndexer";

const LONG = "This sentence contains enough characters to pass the minimum chunk length filter. ".repeat(2);

describe("chunkText", function () {
  it("should not exceed maxChunkSize", function () {
    const longPara = "a".repeat(600);
    const text = `${longPara}\n\n${longPara}\n\n${longPara}`;
    const chunks = chunkText(text, 1000);
    for (const chunk of chunks) {
      assert.isAtMost(chunk.length, 1000);
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
    assert.isTrue(chunks.every(c => c.trim().length >= 100));
  });

  it("should drop everything from the references section onward", function () {
    const content = LONG;
    const ref = "References";
    const afterRef = LONG;
    const chunks = chunkText(`${content}\n\n${ref}\n\n${afterRef}`);
    assert.isTrue(chunks.every(c => !c.includes(afterRef.slice(0, 20))));
    assert.isTrue(chunks.every(c => c !== ref));
  });

  it("should drop references section in German (Quellen)", function () {
    const chunks = chunkText(`${LONG}\n\nQuellen\n\n${LONG}`);
    assert.lengthOf(chunks, 1);
  });

  it("should drop boilerplate lines", function () {
    const text = `${LONG}\n\nAll rights reserved\n\n${LONG}`;
    const chunks = chunkText(text);
    assert.isTrue(chunks.every(c => !/all rights reserved/i.test(c)));
  });
});