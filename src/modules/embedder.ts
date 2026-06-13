/**
    Calls the server and returns the vector
    representation of the given text.
 */
export async function embedText(text: string): Promise<number[]> {
    if (!__server_url__) {
        Zotero.warn("sentAI: SERVER_URL is not set. Add SERVER_URL to .env");
        throw new Error("sentAI: SERVER_URL is not configured");
    }

    const fetchPromise = fetch(`${__server_url__}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Embedding request timed out")), 10000)
    );

    const res = await Promise.race([fetchPromise, timeout]);
    const json = await res.json() as unknown as { embedding: number[] };
    return json.embedding;
}