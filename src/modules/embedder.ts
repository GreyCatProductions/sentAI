import { getServerUrl } from "./serverConfig";

export async function embedText(text: string): Promise<number[]> {
  const serverUrl = getServerUrl();

  const fetchPromise = fetch(`${serverUrl}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Embedding request timed out")), 10000),
  );

  const res = await Promise.race([fetchPromise, timeout]);
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
