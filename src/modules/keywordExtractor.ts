import { callLLM } from "./serverConfig";

const SYSTEM_PROMPT = `Extract the core search terms and academic concepts from the user's question.
Output ONLY a concise comma-separated list of keywords. No sentences. No explanation. No bullet points.

Examples:
"What does Kant say about morality?" → Kant, morality, categorical imperative, ethics, duty
"papers about neural networks in medicine" → neural networks, deep learning, medical diagnosis, clinical AI
"Wie beeinflusst Stress das Immunsystem?" → stress, immune system, cortisol, inflammation, psychological response`;

export async function extractKeywords(query: string): Promise<string> {
  try {
    const result = await callLLM(SYSTEM_PROMPT, `Question: ${query}`, {
      maxTokens: 80,
      temperature: 0,
    });
    return result.trim() || query;
  } catch {
    return query;
  }
}
