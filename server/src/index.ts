import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

const AZURE_ENDPOINT = process.env.AZURE_EMBEDDING_ENDPOINT!;
const AZURE_API_KEY = process.env.AZURE_API_KEY!;
const PORT = process.env.PORT ?? 3000;

app.post("/embed", async (req, res) => {
  const { text } = req.body as { text: string };

  const azureRes = await fetch(AZURE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": AZURE_API_KEY,
    },
    body: JSON.stringify({ input: text }),
  });

  const json = await azureRes.json() as { data: { embedding: number[] }[] };

  if (!azureRes.ok || !json.data) {
    console.error("Azure embedding failed:", azureRes.status, JSON.stringify(json));
    res.status(502).json({ error: "Embedding request failed" });
    return;
  }

  const embedding = json.data[0].embedding;

  res.json({ embedding });
});

app.listen(PORT, () => console.log(`sentAI server running on port ${PORT}`));
