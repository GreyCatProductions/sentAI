import { assert } from "chai";
import { autoAttachPdf, autoAttachPdfCore } from "../src/modules/autoAttach";

const PREF = "extensions.zotero.sentai.autoAttachPdf";

function makeItem(opts: {
  isAttachment?: boolean;
  isNote?: boolean;
  attachments?: { id: number; contentType: string }[];
}): Zotero.Item {
  return {
    id: 77770,
    key: "ATTACH01",
    isAttachment: () => opts.isAttachment ?? false,
    isNote: () => opts.isNote ?? false,
    isRegularItem: () =>
      !(opts.isAttachment ?? false) && !(opts.isNote ?? false),
    getAttachments: () => (opts.attachments ?? []).map((a) => a.id),
  } as unknown as Zotero.Item;
}

describe("autoAttachPdf", function () {
  let originalGet: typeof Zotero.Items.get;
  let originalCanFind: typeof Zotero.Attachments.canFindPDFForItem;
  let originalCanFindFile: unknown;
  let originalAddFile: typeof Zotero.Attachments.addAvailableFile;
  let addFileCallCount: number;

  before(function () {
    originalGet = Zotero.Items.get;
    originalCanFind = Zotero.Attachments.canFindPDFForItem;
    originalCanFindFile = (Zotero.Attachments as any).canFindFileForItem;
    originalAddFile = Zotero.Attachments.addAvailableFile;
  });

  beforeEach(function () {
    addFileCallCount = 0;
    (Zotero.Attachments as any).addAvailableFile = async () => {
      addFileCallCount++;
      return false;
    };
    (Zotero.Attachments as any).canFindPDFForItem = () => true;
    (Zotero.Attachments as any).canFindFileForItem = () => true;
  });

  afterEach(function () {
    Zotero.Prefs.set(PREF, false, true);
    Zotero.Items.get = originalGet;
    (Zotero.Attachments as any).canFindPDFForItem = originalCanFind;
    (Zotero.Attachments as any).canFindFileForItem = originalCanFindFile;
    (Zotero.Attachments as any).addAvailableFile = originalAddFile;
  });

  // ── pref gate (tests autoAttachPdf wrapper) ─────────────────────────────────

  it("pref gate: does not call addAvailableFile when pref is disabled", async function () {
    Zotero.Prefs.set(PREF, false, true);
    await autoAttachPdf(makeItem({}));
    assert.equal(addFileCallCount, 0);
  });

  // ── core logic (tests autoAttachPdfCore, pref bypassed) ─────────────────────

  it("core: does nothing for attachment items", async function () {
    await autoAttachPdfCore(makeItem({ isAttachment: true }));
    assert.equal(addFileCallCount, 0);
  });

  it("core: does nothing for note items", async function () {
    await autoAttachPdfCore(makeItem({ isNote: true }));
    assert.equal(addFileCallCount, 0);
  });

  it("core: does nothing when item already has a PDF attachment", async function () {
    const existingPdfId = 77771;
    (Zotero.Items as any).get = (id: number) =>
      id === existingPdfId
        ? ({
            attachmentContentType: "application/pdf",
          } as unknown as Zotero.Item)
        : originalGet(id);

    await autoAttachPdfCore(
      makeItem({
        attachments: [{ id: existingPdfId, contentType: "application/pdf" }],
      }),
    );
    assert.equal(addFileCallCount, 0);
  });

  it("core: does nothing when canFindPDFForItem returns false (no DOI/ISBN)", async function () {
    (Zotero.Attachments as any).canFindPDFForItem = () => false;
    (Zotero.Attachments as any).canFindFileForItem = () => false;
    await autoAttachPdfCore(makeItem({}));
    assert.equal(addFileCallCount, 0);
  });

  it("core: calls addAvailableFile when item has DOI and no PDF yet", async function () {
    await autoAttachPdfCore(makeItem({}));
    assert.equal(addFileCallCount, 1);
  });

  it("core: does not call addAvailableFile when PDF already present (idempotent)", async function () {
    const pdfId = 77772;
    (Zotero.Items as any).get = (id: number) =>
      id === pdfId
        ? ({
            attachmentContentType: "application/pdf",
          } as unknown as Zotero.Item)
        : originalGet(id);

    const item = makeItem({
      attachments: [{ id: pdfId, contentType: "application/pdf" }],
    });
    await autoAttachPdfCore(item);
    await autoAttachPdfCore(item);
    assert.equal(addFileCallCount, 0);
  });
});
