//Format that is used in the DB
export interface ItemMetadata {
  title?: string;
  authors?: string;
  year?: string;
  abstract?: string;
}

// "abstract" = the paper's abstract stored as its own chunk for paper-level
// retrieval; "body" = a normal sentence-aware chunk of the PDF text.
export type ChunkKind = "abstract" | "body";

export interface EmbeddingRecord {
  paperId: string;
  chunkIndex: number;
  chunkText: string; //Save explicit for fast lookup. TODO: Optional since space expensive. Look up pdf alternative
  chunkKind?: ChunkKind; // defaults to "body" for rows indexed before this field existed
  embedding: number[];
  textHash: string;
  modelId?: string; // embedding model that produced `embedding`; used to keep incompatible vector spaces from being compared
  metadata?: ItemMetadata;
}

export interface SearchFilters {
  collectionId?: number;
  tags?: string[];
  yearFrom?: number;
  yearTo?: number;
  itemType?: string;
}
