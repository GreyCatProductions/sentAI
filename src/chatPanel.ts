/// <reference lib="dom" />

function onSearch() {
  const query = (document.getElementById("sentai-suche-input") as HTMLInputElement).value;
  console.log("Searching for %s", query);
}

function onSend() {
  const text = (document.getElementById("sentai-eingabe-text") as HTMLTextAreaElement).value;
  console.log("Sending %s", text);
}

document.getElementById("sentai-suche-button")!.addEventListener("click", onSearch);
document.getElementById("sentai-senden-button")!.addEventListener("click", onSend);
