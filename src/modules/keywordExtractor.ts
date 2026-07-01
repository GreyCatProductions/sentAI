const KEYWORD_PROMPT = `Extract the core search terms and academic concepts from the user's question.
Output ONLY a concise comma-separated list of keywords. No sentences. No explanation. No bullet points.

Examples:
"What does Kant say about morality?" → Kant, morality, categorical imperative, ethics, duty
"papers about neural networks in medicine" → neural networks, deep learning, medical diagnosis, clinical AI
"Wie beeinflusst Stress das Immunsystem?" → stress, immune system, cortisol, inflammation, psychological response`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export async function extractKeywords(query: string): Promise<string> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${__gemini_api_key__}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${KEYWORD_PROMPT}\n\nQuestion: ${query}` }],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 80 },
        }),
      },
    );

    if (!response.ok) return query;

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || query;
  } catch {
    return query;
  }
}
