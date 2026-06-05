/// <reference lib="dom" />

import { addMessage } from "./ui/messages";
import { onSearch } from "./ui/search";

//Search button implementation
document.getElementById("sentai-suche-button")!.addEventListener("click", onSearch);

//Send button implementation
document.getElementById("sentai-senden-button")!.addEventListener("click", () => {
  const input = document.getElementById("sentai-eingabe-text") as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text) return;
  addMessage("Du", text, true);
  input.value = "";
});
