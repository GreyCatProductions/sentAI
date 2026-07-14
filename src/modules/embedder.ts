import { getServerUrl } from "./serverConfig";
import { getPref } from "../utils/prefs";

const OLLAMA_URL = "http://localhost:11434";

function withTimeout(
  promise: Promise<Response>,
  message: string,
): Promise<Response> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(message)), 10000),
  );
  return Promise.race([promise, timeout]);
}

export async function embedText(text: string): Promise<number[]> {
  return getPref("useLocalOllama")
    ? embedTextLocal(text)
    : embedTextRemote(text);
}

async function embedTextRemote(text: string): Promise<number[]> {
  const serverUrl = getServerUrl();

  const fetchPromise = fetch(`${serverUrl}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const res = await withTimeout(fetchPromise, "Embedding request timed out");
  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(
      `Embedding server error ${res.status}: ${rawText.slice(0, 200)}`,
    );
  }

  let json: { embedding: number[] };
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Embedding server returned non-JSON: ${rawText.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
    throw new Error("Embedding server returned empty embedding vector");
  }

  return json.embedding;
}

async function embedTextLocal(text: string): Promise<number[]> {
  const model =
    (getPref("localEmbeddingModel") as string | undefined) ||
    "nomic-embed-text";

  const fetchPromise = fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });
  const res = await withTimeout(
    fetchPromise,
    "Local embedding request timed out — is Ollama running?",
  );
  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${rawText.slice(0, 200)}`);
  }

  let json: { embeddings?: number[][] };
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`Ollama returned non-JSON: ${rawText.slice(0, 200)}`);
  }

  const embedding = json.embeddings?.[0];
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      `Ollama returned an empty embedding vector — is model "${model}" pulled?`,
    );
  }

  return embedding;
}
