/// <reference lib="dom" />

function setInlineMarkdown(el: HTMLElement, text: string): void {
  const parts = text.split(
    /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\])/,
  );
  for (const part of parts) {
    if (part.startsWith("***") && part.endsWith("***")) {
      const s = document.createElement("strong");
      const e = document.createElement("em");
      e.textContent = part.slice(3, -3);
      s.appendChild(e);
      el.appendChild(s);
    } else if (part.startsWith("**") && part.endsWith("**")) {
      const s = document.createElement("strong");
      s.textContent = part.slice(2, -2);
      el.appendChild(s);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const e = document.createElement("em");
      e.textContent = part.slice(1, -1);
      el.appendChild(e);
    } else if (part.startsWith("[") && part.endsWith("]")) {
      const span = document.createElement("span");
      span.className = "s-cite";
      span.textContent = part;
      el.appendChild(span);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}

function renderMarkdown(raw: string, container: HTMLElement): void {
  const lines = raw.split("\n");
  let ul: HTMLUListElement | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[*-]\s+(.+)/);
    const numbered = trimmed.match(/^\d+\.\s+(.+)/);

    if (bullet || numbered) {
      if (!ul) {
        ul = document.createElement("ul");
        container.appendChild(ul);
      }
      const li = document.createElement("li");
      setInlineMarkdown(li, (bullet ?? numbered)![1]);
      ul.appendChild(li);
    } else {
      if (ul) ul = null;
      if (trimmed === "") {
        container.appendChild(document.createElement("br"));
      } else {
        const span = document.createElement("span");
        setInlineMarkdown(span, line);
        container.appendChild(span);
        container.appendChild(document.createElement("br"));
      }
    }
  }
}

export function addMessage(
  sender: string,
  text: string,
  fromUser = false,
): HTMLElement {
  const container = document.getElementById("sentai-nachrichten")!;

  const senderEl = document.createElement("div");
  senderEl.className = "sender";
  senderEl.textContent = sender;

  const msgEl = document.createElement("div");
  msgEl.className = `message ${fromUser ? "user" : "sentAI"}`;

  if (fromUser) {
    msgEl.textContent = text;
  } else {
    renderMarkdown(text, msgEl);
  }

  container.appendChild(senderEl);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return msgEl;
}

export function updateMessage(msgEl: HTMLElement, text: string): void {
  while (msgEl.firstChild) msgEl.removeChild(msgEl.firstChild);
  renderMarkdown(text, msgEl);
}
