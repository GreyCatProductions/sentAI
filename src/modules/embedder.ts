function getServerUrl(): string {
    const url = Zotero.Prefs.get(
        "extensions.zotero.sentai.serverUrl",
        true,
    ) as string | undefined;
    if (!url) throw new Error("sentAI: Server URL is not configured. Set it in sentAI settings.");
    return url.replace(/\/$/, "");
}

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
      throw new Error(`Embedding server error ${res.status}: ${rawText.slice(0, 200)}`);
    }
    let json: { embedding: number[] };
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(`Embedding server returned non-JSON: ${rawText.slice(0, 200)}`);
    }
    return json.embedding;
}
