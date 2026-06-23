import { search } from "./searchService";

const SYSTEM_PROMPT = `Du bist ein akademischer Forschungsassistent. Deine Aufgabe: Argumente, Gegenargumente und Belege aus der Papier-Bibliothek des Nutzers finden.

Antworte kurz und präzise:
- Max. 3 Punkte pro Abschnitt
- Jede Aussage mit Quellenangabe: [Titel des Papers]
- Struktur: "Argumente dafür:", "Argumente dagegen:", "Kernaussagen:" (nur wenn relevant)
- Nur Inhalte aus den bereitgestellten Auszügen verwenden — keine erfundenen Quellen
- Immer auf Deutsch antworten`;

const ERROR_TEXT = 'Something went wrong. If you have stable internet connection, the issue is likely on our side. Please try again later.'

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = { candidates?: { content?: { parts?: GeminiPart[] } }[] };

export async function ask(query: string): Promise<string> {
  const results = await search(query);

  if (results.length === 0) {
    return "Keine indizierten Papers gefunden. Bitte füge zuerst PDFs zu deiner Zotero-Bibliothek hinzu.";
  }

  const context = results
    .map((r) => `[${r.title}]\n${r.chunkText}`)
    .join("\n\n---\n\n");

  const prompt = `${SYSTEM_PROMPT}\n\nTextauszüge aus meiner Bibliothek:\n\n${context}\n\nFrage: ${query}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${__gemini_api_key__}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    },
  );

  const rawText = await response.text();

  if (!response.ok) {
    return ERROR_TEXT;
  }

  const data: GeminiResponse = JSON.parse(rawText);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");

  return text || ERROR_TEXT;
}
