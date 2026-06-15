import type { EmbeddingRecord } from "../types";

function getEmbeddingModel(): string {
  const model = Zotero.Prefs.get(
    "extensions.zotero.sentai.embeddingModel",
    true,
  ) as string | undefined;
  if (!model) throw new Error("sentAI: embeddingModel preference is not set");
  return model;
}

/**
 * Convert embedding array to base64 string for storage
 * Stores raw Float32Array bytes as base64 (4096 bytes for 768 dims vs ~15000 JSON)
 */
function embeddingToBase64(embedding: number[]): string {
  const f32 = new Float32Array(embedding);
  const bytes = new Uint8Array(f32.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Convert stored string back to embedding array
 */
function base64ToEmbedding(b64: string): number[] {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const float32 = new Float32Array(bytes.buffer);
    return Array.from(float32);
  } catch (e) {
    Zotero.log(`base64ToEmbedding failed: ${e}`);
    return [];
  }
}

function rowToRecord(row: any): EmbeddingRecord {
  const record: EmbeddingRecord = {
    paperId: row.item_key as string,
    chunkIndex: row.chunk_index as number,
    chunkText: row.chunk_text as string,
    embedding: base64ToEmbedding(row.embedding as string),
    textHash: row.text_hash as string,
    createdAt: row.created_at as number,
  };
  if (row.meta_title || row.meta_authors || row.meta_year || row.meta_abstract) {
    record.metadata = {
      title: row.meta_title ?? undefined,
      authors: row.meta_authors ?? undefined,
      year: row.meta_year ?? undefined,
      abstract: row.meta_abstract ?? undefined,
    };
  }
  return record;
}

class EmbeddingStorage {
  private get sentaiDir(): string {
    return PathUtils.join(Zotero.DataDirectory.dir, "sentai");
  }

  private get dbPath(): string {
    // SQLite ATTACH requires forward slashes on Windows
    return PathUtils.join(this.sentaiDir, "sentai.sqlite").replace(/\\/g, "/");
  }

  async init(): Promise<void> {
    Zotero.File.createDirectoryIfMissing(this.sentaiDir);

    try {
      await Zotero.DB.queryAsync(
        `ATTACH DATABASE '${this.dbPath}' AS sentai`,
      );
    } catch (_e) {
      // Already attached (e.g. plugin reload) — ignore
    }

    await Zotero.DB.queryAsync(`
      CREATE TABLE IF NOT EXISTS sentai.chunks (
        item_id       INTEGER NOT NULL,
        item_key      TEXT    NOT NULL,
        chunk_index   INTEGER NOT NULL,
        chunk_text    TEXT    NOT NULL,
        embedding     TEXT    NOT NULL,
        text_hash     TEXT    NOT NULL,
        created_at    INTEGER NOT NULL,
        model_id      TEXT    NOT NULL,
        meta_title    TEXT,
        meta_authors  TEXT,
        meta_year     TEXT,
        meta_abstract TEXT,
        PRIMARY KEY (item_id, chunk_index)
      )
    `);

    Zotero.log(`sentAI: database ready at ${this.dbPath}`);
  }

  async save(itemId: number, records: EmbeddingRecord[]): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        "DELETE FROM sentai.chunks WHERE item_id = ?",
        [itemId],
      );
      for (const r of records) {
        await Zotero.DB.queryAsync(
          `INSERT INTO sentai.chunks
             (item_id, item_key, chunk_index, chunk_text, embedding,
              text_hash, created_at, model_id, meta_title, meta_authors, meta_year, meta_abstract)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            itemId,
            r.paperId,
            r.chunkIndex,
            r.chunkText,
            embeddingToBase64(r.embedding),
            r.textHash,
            r.createdAt,
            getEmbeddingModel(),
            r.metadata?.title ?? null,
            r.metadata?.authors ?? null,
            r.metadata?.year ?? null,
            r.metadata?.abstract ?? null,
          ],
        );
      }
    });
    Zotero.log(`sentAI: saved ${records.length} chunks for item ${itemId}`);
  }

  async load(itemId: number): Promise<EmbeddingRecord[] | undefined> {
    const rows = await Zotero.DB.queryAsync(
      "SELECT * FROM sentai.chunks WHERE item_id = ? ORDER BY chunk_index",
      [itemId],
    );
    if (!rows || (rows as any[]).length === 0) return undefined;
    return (rows as any[]).map(rowToRecord);
  }

  async loadAll(): Promise<Map<number, EmbeddingRecord[]>> {
    const result = new Map<number, EmbeddingRecord[]>();
    const rows = await Zotero.DB.queryAsync(
      "SELECT * FROM sentai.chunks ORDER BY item_id, chunk_index",
    );
    for (const row of (rows as any[]) ?? []) {
      const id = row.item_id as number;
      if (!result.has(id)) result.set(id, []);
      result.get(id)!.push(rowToRecord(row));
    }
    return result;
  }

  async remove(itemId: number): Promise<void> {
    await Zotero.DB.queryAsync(
      "DELETE FROM sentai.chunks WHERE item_id = ?",
      [itemId],
    );
  }

  async removeAll(): Promise<void> {
    await Zotero.DB.queryAsync("DELETE FROM sentai.chunks");
  }

  async isIndexed(itemId: number): Promise<boolean> {
    const rows = await Zotero.DB.queryAsync(
      "SELECT COUNT(*) AS cnt FROM sentai.chunks WHERE item_id = ?",
      [itemId],
    );
    return ((rows as any[])[0]?.cnt ?? 0) > 0;
  }

  async loadByItemIds(ids: number[]): Promise<Map<number, EmbeddingRecord[]>> {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await Zotero.DB.queryAsync(
      `SELECT * FROM sentai.chunks WHERE item_id IN (${placeholders}) ORDER BY item_id, chunk_index`,
      ids,
    );
    const result = new Map<number, EmbeddingRecord[]>();
    for (const row of (rows as any[]) ?? []) {
      const id = row.item_id as number;
      if (!result.has(id)) result.set(id, []);
      result.get(id)!.push(rowToRecord(row));
    }
    return result;
  }

  async close(): Promise<void> {
    try {
      await Zotero.DB.queryAsync("DETACH DATABASE sentai");
    } catch (_e) {
      // Already detached or never attached — ignore
    }
  }

}

export const embeddingStorage = new EmbeddingStorage();
