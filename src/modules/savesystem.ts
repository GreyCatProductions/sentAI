import type { EmbeddingRecord } from "../types";

class EmbeddingStorage {
  private _dir: string | null = null;

  private get dir(): string {
    if (!this._dir)
      this._dir = PathUtils.join(Zotero.DataDirectory.dir, "sentai", "embeddings");
    return this._dir;
  }

  ensureDir(): void {
    Zotero.File.createDirectoryIfMissing(this.dir);
  }

  private filePath(itemId: number): string {
    return PathUtils.join(this.dir, `${itemId}.json`);
  }

  async save(itemId: number, records: EmbeddingRecord[]): Promise<void> {
    const path = this.filePath(itemId);
    Zotero.log(`Saving ${path}`);

    await Zotero.File.putContentsAsync(
      path,
      JSON.stringify(records),
    );
  }

  async load(itemId: number): Promise<EmbeddingRecord[] | undefined> {
    try {
      const text = (await Zotero.File.getContentsAsync(
        this.filePath(itemId),
      )) as string;
      return JSON.parse(text) as EmbeddingRecord[];
    } catch (e) {
      return undefined;
    }
  }

  async remove(itemId: number): Promise<void> {
    await Zotero.File.removeIfExists(this.filePath(itemId));
  }

  /** Load every stored record. Returns a map of itemId → EmbeddingRecord[]. */
  async loadAll(): Promise<Map<number, EmbeddingRecord[]>> {
    const result = new Map<number, EmbeddingRecord[]>();
    try {
      Zotero.log(`sentAI: loadAll scanning ${this.dir}`);
      const entries: OS.File.Entry[] = [];
      await Zotero.File.iterateDirectory(this.dir, (entry: OS.File.Entry) => {
        if (entry.name.endsWith(".json")) entries.push(entry);
      });
      await Promise.all(entries.map(async (entry) => {
        try {
          const text = (await Zotero.File.getContentsAsync(entry.path)) as string;
          const records = JSON.parse(text) as EmbeddingRecord[];
          const id = Number(entry.name.replace(".json", ""));
          if (!Number.isNaN(id)) result.set(id, records);
        } catch (e) {
          Zotero.log(`sentAI: failed to load ${entry.path}: ${e}`);
        }
      }));
    } catch (e) {
      Zotero.log(`sentAI: loadAll error: ${e}`);
    }
    return result;
  }
}

export const embeddingStorage = new EmbeddingStorage();
