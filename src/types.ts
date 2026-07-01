//Format that is used in the DB
export interface ItemMetadata {
    title?: string;
    authors?: string;
    year?: string;
    abstract?: string;
}

export interface EmbeddingRecord {
    paperId: string;
    chunkIndex: number;
    chunkText: string; //Save explicit for fast lookup. TODO: Optional since space expensive. Look up pdf alternative
    embedding: number[];
    textHash: string;
    metadata?: ItemMetadata;
}

export interface SearchFilters {
    collectionId?: number;
    tags?: string[];
    yearFrom?: number;
    yearTo?: number;
    itemType?: string;
}
