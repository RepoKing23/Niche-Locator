import type { KeywordList, ListItem, NewListItem, Report, SavedReportMeta } from "../types";

/** Persistence for keyword lists and saved reports (Supabase or this browser). */
export interface Store {
  kind: "supabase" | "local";
  listLists(): Promise<KeywordList[]>;
  createList(name: string, description?: string): Promise<KeywordList>;
  renameList(id: string, name: string): Promise<void>;
  deleteList(id: string): Promise<void>;
  getItems(listId: string): Promise<ListItem[]>;
  /** Upserts by (niche, city, keyword): saving the same row again refreshes its data but keeps the note. */
  saveItems(listId: string, items: NewListItem[]): Promise<number>;
  removeItems(ids: string[]): Promise<void>;
  updateItem(id: string, patch: Partial<Pick<ListItem, "note" | "row" | "serp">>): Promise<void>;
  /** Copies (or moves) items into another list. */
  copyItems(ids: string[], toListId: string, move: boolean): Promise<void>;
  listReports(): Promise<SavedReportMeta[]>;
  saveReport(report: Report): Promise<void>;
  loadReport(id: string): Promise<Report | null>;
  deleteReport(id: string): Promise<void>;
}

export function itemKey(i: { niche: string; cityId: string; keyword: string }) {
  return `${i.niche}|${i.cityId}|${i.keyword}`;
}
