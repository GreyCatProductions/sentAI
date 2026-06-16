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
    const json = (await res.json()) as unknown as { embedding: number[] };
    return json.embedding;
}
