import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(express.json());

const anthropic = new Anthropic();

const AZURE_ENDPOINT = process.env.AZURE_EMBEDDING_ENDPOINT!;
const AZURE_API_KEY = process.env.AZURE_API_KEY!;
const PORT = process.env.PORT ?? 3000;
const LLM_MODEL = process.env.LLM_MODEL!;

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

app.post("/chat", async (req, res) => {
  const { messages, system } = req.body as {
    messages: Anthropic.MessageParam[];
    system?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = anthropic.messages.stream({
    model: LLM_MODEL,
    max_tokens: 4096,
    ...(system ? { system } : {}),
    messages,
  });

  stream.on("text", (text) => {
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });

  stream.on("error", (err) => {
    console.error("Anthropic stream error:", err);
    res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
    res.end();
  });

  const finalMessage = await stream.finalMessage();
  res.write(`data: ${JSON.stringify({ done: true, usage: finalMessage.usage })}\n\n`);
  res.end();
});

app.listen(PORT, () => console.log(`sentAI server running on port ${PORT}`));
