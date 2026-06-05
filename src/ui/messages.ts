/// <reference lib="dom" />

export function addMessage(sender: string, text: string, fromUser = false): HTMLElement {
  const container = document.getElementById("sentai-nachrichten")!;

  const senderEl = document.createElement("div");
  senderEl.className = "sender";
  senderEl.textContent = sender;

  const msgEl = document.createElement("div");
  msgEl.className = `message ${fromUser ? "user" : "sentAI"}`;
  msgEl.textContent = text;

  container.appendChild(senderEl);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return msgEl;
}
