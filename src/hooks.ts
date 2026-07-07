import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { embeddingStorage } from "./modules/savesystem";
import { PdfIndexer } from "./modules/pdfIndexer";
import { search } from "./modules/searchService";
import { ask } from "./modules/ragService";
import { getServerUrl } from "./modules/serverConfig";
import { getPref, setPref } from "./utils/prefs";
import { autoAttachPdf } from "./modules/autoAttach";
import {
  initSkillsFolder,
  loadSkills,
  openSkillsFolder,
} from "./modules/skillsLoader";

let notifierID: string | undefined;

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise]);

  initLocale();

  await embeddingStorage.init();
  await initSkillsFolder();

  addon.api = {
    search,
    ask,
    getPref: (key: string) => getPref(key as any),
    setPref: (key: string, value: any) => setPref(key as any, value),
    getTags: async (): Promise<string[]> => {
      const libID = Zotero.Libraries.userLibraryID;
      try {
        const tags = await (Zotero.Tags.getAll as any)(libID);
        return ((tags as any[]) ?? [])
          .filter((t: any) => (t.type ?? 0) === 0)
          .map((t: any) => (t.name ?? t.tag ?? "") as string)
          .filter(Boolean)
          .sort() as string[];
      } catch {
        return [];
      }
    },
    serverReachable: async (): Promise<{ reachable: boolean }> => {
      let reachable = false;
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000),
        );
        await Promise.race([fetch(`${getServerUrl()}/health`), timeout]);
        reachable = true;
      } catch {
        reachable = false;
      }
      return { reachable };
    },
    healthCheck: async (): Promise<{
      embedder: boolean;
      hasIndex: boolean;
    }> => {
      let embedder = false;
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000),
        );
        await Promise.race([fetch(`${getServerUrl()}/health`), timeout]);
        embedder = true;
      } catch {
        embedder = false;
      }
      const hasIndex = embedder ? await embeddingStorage.hasAny() : false;
      return { embedder, hasIndex };
    },
    getSkills: () => loadSkills(),
    openSkillsFolder: () => openSkillsFolder(),
    openItem: (itemId: number): void => {
      Zotero.getMainWindow()?.ZoteroPane?.selectItem(itemId);
    },
    getCollections: (): { id: number; name: string }[] => {
      const libID = Zotero.Libraries.userLibraryID;
      const cols = Zotero.Collections.getByLibrary(libID) as any[];
      return cols
        .map((c: any) => ({ id: c.id as number, name: c.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    getIndexStats: () => embeddingStorage.getStats(),
    reindexAll: async (
      onProgress?: (done: number, total: number, title: string) => void,
    ): Promise<void> => {
      const libID = Zotero.Libraries.userLibraryID;
      const s = new Zotero.Search();
      s.addCondition("libraryID", "is", String(libID));
      s.addCondition("itemType", "is", "attachment");
      const ids = (await s.search()) as number[];
      const pdfs = ids
        .map((id) => Zotero.Items.get(id) as Zotero.Item | false)
        .filter(
          (item): item is Zotero.Item =>
            !!item &&
            (item as any).isAttachment() &&
            (item as any).attachmentContentType === "application/pdf",
        );
      const uniquePdfs: Zotero.Item[] = [];
      for (const pdf of pdfs) {
        if (!(await hasSizeSibling(pdf))) uniquePdfs.push(pdf);
      }
      let done = 0;
      for (const pdf of uniquePdfs) {
        const parent = (pdf as any).parentItem ?? pdf;
        const title = (parent.getField("title") as string) || "Untitled";
        onProgress?.(done, uniquePdfs.length, title);
        await PdfIndexer.process(pdf);
        done++;
      }
    },
    reindexCollection: async (
      collectionId: number,
      onProgress?: (done: number, total: number, title: string) => void,
    ): Promise<void> => {
      const col = Zotero.Collections.get(collectionId) as any;
      const items: Zotero.Item[] = col?.getChildItems(false) ?? [];
      const pdfs: Zotero.Item[] = [];
      for (const item of items) {
        if (
          (item as any).isAttachment() &&
          (item as any).attachmentContentType === "application/pdf"
        ) {
          pdfs.push(item);
        } else {
          for (const attId of (item.getAttachments() as number[])) {
            const att = Zotero.Items.get(attId) as Zotero.Item | false;
            if (
              att &&
              (att as any).isAttachment() &&
              (att as any).attachmentContentType === "application/pdf"
            ) {
              pdfs.push(att);
            }
          }
        }
      }
      const uniquePdfs: Zotero.Item[] = [];
      for (const pdf of pdfs) {
        if (!(await hasSizeSibling(pdf))) uniquePdfs.push(pdf);
      }
      let done = 0;
      for (const pdf of uniquePdfs) {
        const parent = (pdf as any).parentItem ?? pdf;
        const title = (parent.getField("title") as string) || "Untitled";
        onProgress?.(done, uniquePdfs.length, title);
        await PdfIndexer.process(pdf);
        done++;
      }
    },
    deleteIndex: async (collectionId?: number): Promise<void> => {
      if (collectionId == null) {
        await embeddingStorage.removeAll();
      } else {
        const col = Zotero.Collections.get(collectionId) as any;
        const items: Zotero.Item[] = col?.getChildItems(false) ?? [];
        for (const item of items) {
          if ((item as any).isAttachment()) {
            await embeddingStorage.remove(item.id);
          } else {
            for (const attId of item.getAttachments() as number[]) {
              await embeddingStorage.remove(attId);
            }
          }
        }
      }
    },
  };
  addon.data.initialized = true;

  notifierID = Zotero.Notifier.registerObserver({ notify: onNotify }, ["item"]);

  // UI-dependent setup: wait for the main window before touching the DOM
  await Zotero.uiReadyPromise;

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addon.data.config.addonRef}/content/preferences.xhtml`,
    label: "sentAI",
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  registerToolbarButton(win);
}

async function hasSizeSibling(pdf: Zotero.Item): Promise<boolean> {
  const parent = (pdf as any).parentItem as Zotero.Item | undefined;
  if (!parent) return false;

  const path = (await pdf.getFilePathAsync()) as string | false;
  if (!path) return false;

  let size: number;
  try {
    const info = await (globalThis as any).IOUtils.stat(path);
    size = info.size as number;
  } catch {
    return false;
  }
  if (size === 0) return false;

  for (const sibId of parent.getAttachments() as number[]) {
    if (sibId >= pdf.id) continue;
    const sib = Zotero.Items.get(sibId) as Zotero.Item | false;
    if (
      !sib ||
      !(sib as any).isAttachment() ||
      (sib as any).attachmentContentType !== "application/pdf"
    )
      continue;
    const sibPath = (await sib.getFilePathAsync()) as string | false;
    if (!sibPath) continue;
    try {
      const sibInfo = await (globalThis as any).IOUtils.stat(sibPath);
      if ((sibInfo.size as number) === size) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function registerToolbarButton(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  if (doc.getElementById("sentai-toolbar-button")) return;

  const toolbar = doc.querySelector("#zotero-items-toolbar");
  if (!toolbar) return;

  const iconUrl = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

  let button: Element;
  const lookupNode = toolbar.querySelector("#zotero-tb-lookup");
  if (lookupNode) {
    button = lookupNode.cloneNode(true) as Element;
    button.setAttribute("command", "");
    button.setAttribute("oncommand", "");
    button.setAttribute("mousedown", "");
    button.setAttribute("onmousedown", "");
  } else {
    button = doc.createXULElement("toolbarbutton");
    button.setAttribute("class", "zotero-tb-button");
  }

  button.setAttribute("id", "sentai-toolbar-button");
  button.setAttribute("label", "sentAI");
  button.setAttribute("tooltiptext", "sentAI Chat");
  (button as HTMLElement).style.listStyleImage = `url("${iconUrl}")`;
  button.addEventListener("click", () => openChatPanel(win));

  const searchBox = toolbar.querySelector("#zotero-tb-search");
  const separator = doc.createXULElement("toolbarseparator");
  separator.setAttribute("id", "sentai-toolbar-separator");

  if (searchBox) {
    toolbar.insertBefore(separator, searchBox);
    toolbar.insertBefore(button, separator);
  } else {
    toolbar.appendChild(button);
    toolbar.appendChild(separator);
  }
}

function openChatPanel(win: Window) {
  const url = `chrome://${addon.data.config.addonRef}/content/chatPanel.xhtml`;
  win.openDialog(
    url,
    "sentai-chat-panel",
    "chrome,resizable,centerscreen,width=480,height=640",
    addon.api,
  );
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  embeddingStorage.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  if (event === "add" && type === "item") {
    for (const id of ids as number[]) {
      const item = Zotero.Items.get(id);
      if (!item) continue;
      if (
        item.isAttachment() &&
        item.attachmentContentType === "application/pdf"
      ) {
        if (await embeddingStorage.isIndexed(item.id)) continue;
        if (await hasSizeSibling(item)) continue;
        await PdfIndexer.process(item);
      } else {
        await autoAttachPdf(item);
      }
    }
  }

  if ((event === "delete" || event === "trash") && type === "item") {
    for (const id of ids as number[]) {
      Zotero.log(`sentAI: ${event} fired for item ${id}`);
      await embeddingStorage.remove(id);
      if (event === "trash") {
        const item = Zotero.Items.get(id);
        const attachments = item?.getAttachments() ?? [];
        Zotero.log(`sentAI: child attachments: [${attachments.join(", ")}]`);
        for (const attId of attachments) {
          await embeddingStorage.remove(attId);
        }
      }
    }
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  // No preferences registered
}

function onShortcuts(type: string) {
  // No shortcuts registered
}

function onDialogEvents(type: string) {
  // No dialog events registered
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
