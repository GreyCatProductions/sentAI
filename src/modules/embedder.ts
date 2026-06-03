/**
    Calls the server and returns the vector
    representation of the given text.
 */
export async function embedText(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${__server_url__}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json() as unknown as { embedding: number[] };
    return json.embedding;
}