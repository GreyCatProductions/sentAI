import { getPref } from "../utils/prefs";

// Core logic — separated so tests can invoke it directly without the pref gate.
export async function autoAttachPdfCore(item: Zotero.Item): Promise<void> {
  if (item.isAttachment() || item.isNote()) return;

  const attachmentIDs = item.getAttachments();
  for (const attID of attachmentIDs) {
    const att = Zotero.Items.get(attID);
    if (att?.attachmentContentType === "application/pdf") return;
  }

  const att = Zotero.Attachments as any;
  const canFind = (att.canFindFileForItem ?? att.canFindPDFForItem).bind(att);
  if (!canFind(item)) return;

  Zotero.debug(`sentAI: auto-attaching PDF for item ${item.id}`);
  try {
    const addFile = (att.addAvailableFile ?? att.addAvailablePDF).bind(att);
    await addFile(item);
  } catch (e) {
    Zotero.logError(e as Error);
  }
}

export async function autoAttachPdf(item: Zotero.Item): Promise<void> {
  if (!getPref("autoAttachPdf")) return;
  return autoAttachPdfCore(item);
}
