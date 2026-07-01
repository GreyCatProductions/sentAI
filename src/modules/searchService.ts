import { embedText } from "./embedder";
import { embeddingStorage } from "./savesystem";
import { semanticSearch } from "./semanticSearch";
import { getPref } from "../utils/prefs";
import type { SearchFilters } from "../types";

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

export async function search(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);
  const libID = Zotero.Libraries.userLibraryID;

  const { collectionId, tags, yearFrom, yearTo, itemType } = filters;
  const hasMetaFilter =
    (tags && tags.length > 0) ||
    yearFrom != null ||
    yearTo != null ||
    !!itemType;

  let candidateItemIds: number[] | null = null;

  if (collectionId != null) {
    const col = Zotero.Collections.get(collectionId) as any;
    const items: Zotero.Item[] = col?.getChildItems(false) ?? [];
    candidateItemIds = items.map((i) => i.id);
  }

  if (hasMetaFilter) {
    const baseIds =
      candidateItemIds ?? (await embeddingStorage.getIndexedItemIds());
    const filtered: number[] = [];

    for (const id of baseIds) {
      const item = Zotero.Items.get(id) as Zotero.Item | false;
      const target =
        item && (item as any).isAttachment?.() && (item as any).parentItem
          ? ((item as any).parentItem as Zotero.Item)
          : item || false;
      if (!target) continue;

      if (tags && tags.length > 0) {
        const itemTags = (
          (target as any).getTags() as { tag: string; type: number }[]
        )
          .filter((t) => t.type === 0)
          .map((t) => t.tag);
        if (!tags.some((t) => itemTags.includes(t))) continue;
      }

      if (yearFrom != null || yearTo != null) {
        const rawDate = (target as any).getField("date") as string | undefined;
        const yearStr = rawDate?.match(/\d{4}/)?.[0];
        const year = yearStr ? parseInt(yearStr, 10) : null;
        if (year == null) continue;
        if (yearFrom != null && year < yearFrom) continue;
        if (yearTo != null && year > yearTo) continue;
      }

      if (itemType) {
        if ((target as any).itemType !== itemType) continue;
      }

      filtered.push(id);
    }
    candidateItemIds = filtered;
  }

  let allRecords;
  if (candidateItemIds != null) {
    const byId = await embeddingStorage.loadByItemIds(candidateItemIds);
    allRecords = Array.from(byId.values()).flat();
  } else {
    const allEmbeddings = await embeddingStorage.loadAll();
    allRecords = Array.from(allEmbeddings.values()).flat();
  }

  if (allRecords.length === 0) return [];

  const topK = (getPref("topK") as number) || 5;
  const top = semanticSearch(queryEmbedding, allRecords, topK);

  return top.map((result) => {
    const { chunkText, similarity } = result;

    const item = Zotero.Items.getByLibraryAndKey(libID, result.paperId) as
      | Zotero.Item
      | false;
    const parent =
      item && (item as any).parentItem
        ? (item as any).parentItem
        : item || false;
    const itemId: number | undefined = parent ? (parent as any).id : undefined;

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
      (parent && ((parent as any).getField("title") as string | undefined)) ||
      result.paperId;

    const authors = parent
      ? (() => {
          const creators = (parent as any).getCreators() as {
            firstName?: string;
            lastName?: string;
          }[];
          if (!creators.length) return undefined;
          const first = creators[0].lastName ?? creators[0].firstName ?? "";
          return creators.length > 1 ? `${first} et al.` : first;
        })()
      : undefined;

    const rawDate = parent
      ? ((parent as any).getField("date") as string | undefined)
      : undefined;
    const year = rawDate ? rawDate.match(/\d{4}/)?.[0] : undefined;

    const journal = parent
      ? ((parent as any).getField("publicationTitle") as string | undefined) ||
        ((parent as any).getField("publisher") as string | undefined)
      : undefined;

    return {
      title,
      chunkText,
      similarity,
      authors,
      year,
      journal,
      chunkIndex: result.chunkIndex,
      itemId,
    };
  });
}
