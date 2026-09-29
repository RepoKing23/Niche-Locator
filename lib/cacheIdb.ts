import type { CacheBackend, CacheEntry } from "./cache";

const DB = "niche-locator";
const STORE = "api-cache";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Browser cache for DataForSEO results in IndexedDB (much larger than localStorage). */
export class IdbCache implements CacheBackend {
  private db: Promise<IDBDatabase> | null = null;
  private conn() {
    this.db ??= open();
    return this.db;
  }

  async getMany(keys: string[]) {
    const out = new Map<string, CacheEntry>();
    try {
      const db = await this.conn();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        keys.forEach((k) => {
          const r = store.get(k);
          r.onsuccess = () => r.result && out.set(k, r.result as CacheEntry);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // No IndexedDB (private mode etc.): behave as an empty cache.
    }
    return out;
  }

  async putMany(entries: [string, CacheEntry][]) {
    try {
      const db = await this.conn();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        entries.forEach(([k, v]) => store.put(v, k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Caching is best-effort.
    }
  }
}
