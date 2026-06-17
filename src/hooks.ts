import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { embeddingStorage } from "./modules/savesystem";
import { PdfIndexer } from "./modules/pdfIndexer";
import { search } from "./modules/searchService";
import { getPref, setPref } from "./utils/prefs";

let notifierID: string | undefined;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await embeddingStorage.init();

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addon.data.config.addonRef}/content/preferences.xhtml`,
    label: "sentAI",
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
  });

  addon.api = {
    search,
    getPref: (key: string) => getPref(key as any),
    setPref: (key: string, value: any) => setPref(key as any, value),
  };
  addon.data.initialized = true;

  notifierID = Zotero.Notifier.registerObserver(
    { notify: onNotify },
    ["item"],
  );

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

  registerChatPanelMenuItem(win);
}

function registerChatPanelMenuItem(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  if (doc.getElementById("sentai-open-chat")) return;

  const toolsPopup = doc.getElementById("menu_ToolsPopup");
  if (!toolsPopup) return;

  const separator = doc.createXULElement("menuseparator");
  separator.setAttribute("id", "sentai-menu-separator");
  toolsPopup.appendChild(separator);

  const menuItem = doc.createXULElement("menuitem");
  menuItem.setAttribute("id", "sentai-open-chat");
  menuItem.setAttribute("label", "sentAI Chat");
  menuItem.addEventListener("command", () => openChatPanel(win));
  toolsPopup.appendChild(menuItem);
}

function openChatPanel(win: Window) {
  const url = `chrome://${addon.data.config.addonRef}/content/chatPanel.xhtml`;
  win.openDialog(url, "sentai-chat-panel", "chrome,resizable,centerscreen,width=440,height=520", addon.api);
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
        await PdfIndexer.process(item);
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
