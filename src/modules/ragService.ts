import { search } from "./searchService";

const SYSTEM_PROMPT = `You are a research assistant with access to excerpts from the user's academic paper library.
Answer the user's question using ONLY the provided paper excerpts.
For each claim, cite the source paper inline like this: [Paper Title].
If the excerpts don't contain enough information to answer, say so honestly.
Be concise and precise.`;

export async function ask(query: string): Promise<string> {
  const results = await search(query);

  if (results.length === 0) {
    return "No indexed papers found. Please index some PDFs first by adding them to your Zotero library.";
  }

  const context = results
    .map((r) => `[${r.title}]\n${r.chunkText}`)
    .join("\n\n---\n\n");

  const userPrompt = `Paper excerpts from my library:\n\n${context}\n\nQuestion: ${query}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${__gemini_api_key__}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
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

  return (
    (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ??
    "No response from Gemini."
  );
}
