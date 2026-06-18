import { embedText } from "./embedder";
import { embeddingStorage } from "./savesystem";
import { semanticSearch } from "./semanticSearch";
import { getPref } from "../utils/prefs";

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

  const topK = (getPref("topK") as number) || 5;
  const top = semanticSearch(queryEmbedding, allRecords, topK);

  return top.map(result => {
    if (result.metadata?.title) {
      return { title: result.metadata.title, chunkText: result.chunkText, similarity: result.similarity };
    }
    const libID = Zotero.Libraries.userLibraryID;
    const item = Zotero.Items.getByLibraryAndKey(libID, result.paperId) as Zotero.Item | false;
    const title: string =
      (item && (item.parentItem?.getField("title") as string | undefined)) ||
      (item && (item.getField("title") as string | undefined)) ||
      result.paperId;
    return { title, chunkText: result.chunkText, similarity: result.similarity };
  });
}
