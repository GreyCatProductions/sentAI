import { search } from "./searchService";

const SYSTEM_PROMPT = `Du bist ein akademischer Forschungsassistent. Deine Aufgabe: Argumente, Gegenargumente und Belege aus der Papier-Bibliothek des Nutzers finden.

Antworte kurz und präzise:
- Max. 3 Punkte pro Abschnitt
- Jede Aussage mit Quellenangabe: [Titel des Papers]
- Struktur: "Argumente dafür:", "Argumente dagegen:", "Kernaussagen:" (nur wenn relevant)
- Nur Inhalte aus den bereitgestellten Auszügen verwenden — keine erfundenen Quellen
- Immer auf Deutsch antworten`;

export async function ask(query: string): Promise<string> {
  const results = await search(query);

  if (results.length === 0) {
    return "No indexed papers found. Please index some PDFs first by adding them to your Zotero library.";
  }

  const context = results
    .map((r) => `[${r.title}]\n${r.chunkText}`)
    .join("\n\n---\n\n");

  const userPrompt = `${SYSTEM_PROMPT}\n\nPaper excerpts from my library:\n\n${context}\n\nQuestion: ${query}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${__gemini_api_key__}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${rawText.slice(0, 300)}`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini returned non-JSON (${response.status}): ${rawText.slice(0, 300)}`);
  }

  const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? "")
    .join("");

  return text || "No response from Gemini.";
}
