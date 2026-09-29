import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "../keywords";
import type { KeywordList, ListItem, NewListItem, Report, SavedReportMeta } from "../types";
import type { Store } from "./types";

type ListRow = {
  id: string; name: string; description: string; created_at: string; updated_at: string;
  list_items?: { count: number }[];
};
type ItemRow = {
  id: string; list_id: string; niche: string; city_id: string; keyword: string;
  row: ListItem["row"]; serp: ListItem["serp"]; note: string; created_at: string;
};

const toList = (r: ListRow): KeywordList => ({
  id: r.id, name: r.name, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at,
  itemCount: r.list_items?.[0]?.count ?? 0,
});

const toItem = (r: ItemRow): ListItem => ({
  id: r.id, listId: r.list_id, niche: r.niche, cityId: r.city_id, keyword: r.keyword,
  row: r.row, serp: r.serp, note: r.note, createdAt: r.created_at,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Stores lists and reports in Supabase; row-level security scopes everything to the signed-in user. */
export class SupabaseStore implements Store {
  kind = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  async listLists() {
    const rows = check(await this.db.from("keyword_lists").select("*, list_items(count)").order("updated_at", { ascending: false }));
    return (rows as ListRow[]).map(toList);
  }

  async createList(name: string, description = "") {
    const row = check(await this.db.from("keyword_lists").insert({ name: name.trim(), description }).select().single());
    return toList(row as ListRow);
  }

  async renameList(id: string, name: string) {
    check(await this.db.from("keyword_lists").update({ name: name.trim() }).eq("id", id));
  }

  async deleteList(id: string) {
    check(await this.db.from("keyword_lists").delete().eq("id", id));
  }

  private async touch(listId: string) {
    check(await this.db.from("keyword_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId));
  }

  async getItems(listId: string) {
    const rows = check(await this.db.from("list_items").select("*").eq("list_id", listId).order("created_at"));
    return (rows as ItemRow[]).map(toItem);
  }

  async saveItems(listId: string, items: NewListItem[]) {
    for (const batch of chunk(items, 500)) {
      check(await this.db.from("list_items").upsert(
        batch.map((i) => ({ list_id: listId, niche: i.niche, city_id: i.cityId, keyword: i.keyword, row: i.row, serp: i.serp })),
        { onConflict: "list_id,niche,city_id,keyword" },
      ));
    }
    await this.touch(listId);
    return items.length;
  }

  async removeItems(ids: string[]) {
    for (const batch of chunk(ids, 200)) check(await this.db.from("list_items").delete().in("id", batch));
  }

  async updateItem(id: string, patch: Partial<Pick<ListItem, "note" | "row" | "serp">>) {
    check(await this.db.from("list_items").update(patch).eq("id", id));
  }

  async copyItems(ids: string[], toListId: string, move: boolean) {
    const rows: ItemRow[] = [];
    for (const batch of chunk(ids, 200)) {
      rows.push(...(check(await this.db.from("list_items").select("*").in("id", batch)) as ItemRow[]));
    }
    for (const batch of chunk(rows, 500)) {
      check(await this.db.from("list_items").upsert(
        batch.map((r) => ({ list_id: toListId, niche: r.niche, city_id: r.city_id, keyword: r.keyword, row: r.row, serp: r.serp, note: r.note })),
        { onConflict: "list_id,niche,city_id,keyword" },
      ));
    }
    await this.touch(toListId);
    if (move) await this.removeItems(rows.filter((r) => r.list_id !== toListId).map((r) => r.id));
  }

  async listReports(): Promise<SavedReportMeta[]> {
    const rows = check(await this.db.from("reports").select("id, niche, mode, city_count, created_at")
      .order("created_at", { ascending: false }).limit(50));
    return (rows as { id: string; niche: string; mode: "live" | "demo"; city_count: number; created_at: string }[])
      .map((r) => ({ id: r.id, niche: r.niche, mode: r.mode, cityCount: r.city_count, createdAt: r.created_at }));
  }

  async saveReport(report: Report) {
    check(await this.db.from("reports").upsert({
      id: report.id, niche: report.niche, mode: report.mode, city_count: report.cityIds.length,
      created_at: report.createdAt, data: report,
    }));
  }

  async loadReport(id: string) {
    const row = check(await this.db.from("reports").select("data").eq("id", id).maybeSingle());
    return (row as { data: Report } | null)?.data ?? null;
  }

  async deleteReport(id: string) {
    check(await this.db.from("reports").delete().eq("id", id));
  }
}
