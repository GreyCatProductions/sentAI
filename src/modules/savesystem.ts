import type { EmbeddingRecord } from "../types";

class EmbeddingStorage {
  private readonly dir: string;

  constructor(dataDir: string = Zotero.DataDirectory.dir) {
    this.dir = `${dataDir}/sentai/embeddings`;
  }

  ensureDir(): void {
    Zotero.File.createDirectoryIfMissing(this.dir);
  }

  private filePath(itemId: number): string {
    return `${this.dir}/${itemId}.json`;
  }

  async save(itemId: number, record: EmbeddingRecord): Promise<void> {
    await Zotero.File.putContentsAsync(
      this.filePath(itemId),
      JSON.stringify(record),
    );
  }

  async load(itemId: number): Promise<EmbeddingRecord | undefined> {
    try {
      const text = (await Zotero.File.getContentsAsync(
        this.filePath(itemId),
      )) as string;
      return JSON.parse(text) as EmbeddingRecord;
    } catch (e) {
      return undefined;
    }
  }

  async remove(itemId: number): Promise<void> {
    await Zotero.File.removeIfExists(this.filePath(itemId));
  }

  /** Load every stored record. Returns a map of itemId → EmbeddingRecord. */
  async loadAll(): Promise<Map<number, EmbeddingRecord>> {
    const result = new Map<number, EmbeddingRecord>();
    try {
      await Zotero.File.iterateDirectory(this.dir, async (entry: OS.File.Entry) => {
        if (!entry.name.endsWith(".json")) return;
        try {
          const text = (await Zotero.File.getContentsAsync(
            entry.path,
          )) as string;
          const record = JSON.parse(text) as EmbeddingRecord;
          const id = Number(entry.name.replace(".json", ""));
          if (!Number.isNaN(id)) result.set(id, record);
        } catch {
          // Corrupt file
        }
      });
    } catch {
      // Directory doesnt exist likely
    }
    return result;
  }
}

export const embeddingStorage = new EmbeddingStorage();
