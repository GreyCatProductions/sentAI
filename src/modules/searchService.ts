import { embedText } from "./embedder";
import { embeddingStorage } from "./savesystem";
import { semanticSearch } from "./semanticSearch";
import { getPref } from "../utils/prefs";

export interface SearchResult {
  title: string;
  chunkText: string;
  similarity: number;
  authors?: string;
  year?: string;
  journal?: string;
  chunkIndex?: number;
  itemId?: number;
}

export async function search(query: string, collectionId?: number): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);

  let allRecords;
  if (collectionId != null) {
    const col = Zotero.Collections.get(collectionId) as any;
    const items: Zotero.Item[] = col?.getChildItems(false) ?? [];
    const byId = await embeddingStorage.loadByItemIds(items.map((i) => i.id));
    allRecords = Array.from(byId.values()).flat();
  } else {
    const allEmbeddings = await embeddingStorage.loadAll();
    allRecords = Array.from(allEmbeddings.values()).flat();
  }

  if (allRecords.length === 0) return [];

  const topK = (getPref("topK") as number) || 5;
  const top = semanticSearch(queryEmbedding, allRecords, topK);

  const libID = Zotero.Libraries.userLibraryID;

  return top.map(result => {
    const { chunkText, similarity } = result;

    const item = Zotero.Items.getByLibraryAndKey(libID, result.paperId) as Zotero.Item | false;
    const parent = item && item.parentItem ? item.parentItem : item || false;
    const itemId: number | undefined = parent ? parent.id : undefined;

    if (result.metadata?.title) {
      return {
        title: result.metadata.title,
        chunkText,
        similarity,
        authors: result.metadata.authors,
        year: result.metadata.year,
        chunkIndex: result.chunkIndex,
        itemId,
      };
    }

    const title: string =
      (parent && (parent.getField("title") as string | undefined)) ||
      result.paperId;

    const authors = parent
      ? (() => {
          const creators = parent.getCreators() as { firstName?: string; lastName?: string }[];
          if (!creators.length) return undefined;
          const first = creators[0].lastName ?? creators[0].firstName ?? "";
          return creators.length > 1 ? `${first} et al.` : first;
        })()
      : undefined;

    const rawDate = parent ? (parent.getField("date") as string | undefined) : undefined;
    const year = rawDate ? rawDate.match(/\d{4}/)?.[0] : undefined;

    const journal = parent
      ? ((parent.getField("publicationTitle") as string | undefined) ||
         (parent.getField("publisher") as string | undefined))
      : undefined;

    return { title, chunkText, similarity, authors, year, journal, chunkIndex: result.chunkIndex, itemId };
  });
}
