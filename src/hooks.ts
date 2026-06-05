import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { embeddingStorage } from "./modules/savesystem";
import { PdfIndexer } from "./modules/pdfIndexer";

let notifierID: string | undefined;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  embeddingStorage.ensureDir();

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
  win.openDialog(url, "sentai-chat-panel", "chrome,resizable,centerscreen,width=420,height=620");
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
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
      if (
        item.isAttachment() &&
        item.attachmentContentType === "application/pdf"
      ) {
        await PdfIndexer.process(item);
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
