import { embedText } from "./embedder";
import { embeddingStorage } from "./savesystem";
import { semanticSearch } from "./semanticSearch";

export interface SearchResult {
  title: string;
  chunkText: string;
  similarity: number;
}

export async function search(query: string): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);

  const allEmbeddings = await embeddingStorage.loadAll();
  const allRecords = Array.from(allEmbeddings.values()).flat();

  if (allRecords.length === 0) return [];

  const top = semanticSearch(queryEmbedding, allRecords, 5);

  return top.map(result => {
    const attachment = Zotero.Items.get(Number(result.paperId));
    const title: string =
      attachment?.parentItem?.getField("title") ??
      attachment?.getField("title") ??
      result.paperId;
    return { title, chunkText: result.chunkText, similarity: result.similarity };
  });
}
