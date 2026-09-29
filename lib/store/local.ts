import type { KeywordList, ListItem, NewListItem, Report, SavedReportMeta } from "../types";
import { itemKey, type Store } from "./types";

const LISTS_KEY = "niche-locator:lists";
const ITEMS_KEY = (listId: string) => `niche-locator:items:${listId}`;
const REPORTS_KEY = "niche-locator:reports";
const MAX_REPORTS = 8;

/** Minimal storage surface so tests can pass an in-memory map. */
export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const now = () => new Date().toISOString();
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Stores everything as JSON in this browser's localStorage. */
export class LocalStore implements Store {
  kind = "local" as const;
  constructor(private kv: KV) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.kv.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    try {
      this.kv.setItem(key, JSON.stringify(value));
    } catch {
      throw new Error("Browser storage is full. Connect Supabase or remove old reports/lists.");
    }
  }

  private lists(): Omit<KeywordList, "itemCount">[] {
    return this.read(LISTS_KEY, []);
  }

  private items(listId: string): ListItem[] {
    return this.read(ITEMS_KEY(listId), []);
  }

  private touch(listId: string) {
    this.write(LISTS_KEY, this.lists().map((l) => (l.id === listId ? { ...l, updatedAt: now() } : l)));
  }

  async listLists(): Promise<KeywordList[]> {
    return this.lists()
      .map((l) => ({ ...l, itemCount: this.items(l.id).length }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createList(name: string, description = ""): Promise<KeywordList> {
    const list = { id: uid(), name: name.trim(), description, createdAt: now(), updatedAt: now() };
    this.write(LISTS_KEY, [...this.lists(), list]);
    return { ...list, itemCount: 0 };
  }

  async renameList(id: string, name: string) {
    this.write(LISTS_KEY, this.lists().map((l) => (l.id === id ? { ...l, name: name.trim(), updatedAt: now() } : l)));
  }

  async deleteList(id: string) {
    this.write(LISTS_KEY, this.lists().filter((l) => l.id !== id));
    this.kv.removeItem(ITEMS_KEY(id));
  }

  async getItems(listId: string) {
    return this.items(listId);
  }

  async saveItems(listId: string, incoming: NewListItem[]) {
    const items = this.items(listId);
    const byKey = new Map(items.map((i) => [itemKey(i), i]));
    for (const n of incoming) {
      const existing = byKey.get(itemKey(n));
      if (existing) Object.assign(existing, { row: n.row, serp: n.serp });
      else {
        const item: ListItem = { ...n, id: uid(), listId, note: "", createdAt: now() };
        items.push(item);
        byKey.set(itemKey(n), item);
      }
    }
    this.write(ITEMS_KEY(listId), items);
    this.touch(listId);
    return incoming.length;
  }

  private allListIds() {
    return this.lists().map((l) => l.id);
  }

  async removeItems(ids: string[]) {
    const drop = new Set(ids);
    for (const listId of this.allListIds()) {
      const items = this.items(listId);
      const kept = items.filter((i) => !drop.has(i.id));
      if (kept.length !== items.length) {
        this.write(ITEMS_KEY(listId), kept);
        this.touch(listId);
      }
    }
  }

  async updateItem(id: string, patch: Partial<Pick<ListItem, "note" | "row" | "serp">>) {
    for (const listId of this.allListIds()) {
      const items = this.items(listId);
      const item = items.find((i) => i.id === id);
      if (item) {
        Object.assign(item, patch);
        this.write(ITEMS_KEY(listId), items);
        return;
      }
    }
  }

  async copyItems(ids: string[], toListId: string, move: boolean) {
    const wanted = new Set(ids);
    const picked = this.allListIds().flatMap((l) => this.items(l).filter((i) => wanted.has(i.id)));
    await this.saveItems(toListId, picked.map(({ niche, cityId, keyword, row, serp }) => ({ niche, cityId, keyword, row, serp })));
    // Keep notes when copying.
    const target = this.items(toListId);
    const notes = new Map(picked.map((i) => [itemKey(i), i.note]));
    target.forEach((t) => {
      const note = notes.get(itemKey(t));
      if (note && !t.note) t.note = note;
    });
    this.write(ITEMS_KEY(toListId), target);
    if (move) await this.removeItems(picked.filter((i) => i.listId !== toListId).map((i) => i.id));
  }

  async listReports(): Promise<SavedReportMeta[]> {
    return this.read<Report[]>(REPORTS_KEY, []).map((r) => ({
      id: r.id, niche: r.niche, mode: r.mode, cityCount: r.cityIds.length, createdAt: r.createdAt,
    }));
  }

  async saveReport(report: Report) {
    const reports = [report, ...this.read<Report[]>(REPORTS_KEY, []).filter((r) => r.id !== report.id)];
    // Drop the oldest reports until it fits in browser storage.
    for (let n = Math.min(reports.length, MAX_REPORTS); n > 0; n--) {
      try {
        this.kv.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, n)));
        return;
      } catch {
        // too big, try with fewer
      }
    }
    throw new Error("This report is too large for browser storage. Connect Supabase to save big reports.");
  }

  async loadReport(id: string) {
    return this.read<Report[]>(REPORTS_KEY, []).find((r) => r.id === id) ?? null;
  }

  async deleteReport(id: string) {
    this.write(REPORTS_KEY, this.read<Report[]>(REPORTS_KEY, []).filter((r) => r.id !== id));
  }
}
