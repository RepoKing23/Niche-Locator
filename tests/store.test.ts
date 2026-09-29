import { beforeEach, describe, expect, it } from "vitest";
import { findCity } from "@/lib/cities";
import { mockNiche } from "@/lib/mock";
import { buildCityRow, buildSnapshot } from "@/lib/scoring";
import { LocalStore, type KV } from "@/lib/store/local";
import type { NewListItem } from "@/lib/types";

function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function item(cityId: string, niche = "stair installer"): NewListItem {
  const snap = buildSnapshot(niche, mockNiche([niche]).metrics, 0);
  const row = buildCityRow(findCity(cityId)!, snap, niche, null, null, "done");
  return { niche, cityId, keyword: niche, row, serp: null };
}

describe("LocalStore", () => {
  let store: LocalStore;
  beforeEach(() => (store = new LocalStore(memoryKV())));

  it("creates, renames and deletes lists", async () => {
    const a = await store.createList("Stairs TX");
    await store.createList("Client B");
    await store.renameList(a.id, "Stairs Texas");
    expect((await store.listLists()).map((l) => l.name).sort()).toEqual(["Client B", "Stairs Texas"]);
    await store.deleteList(a.id);
    expect((await store.listLists()).map((l) => l.name)).toEqual(["Client B"]);
  });

  it("saves rows, upserts duplicates and keeps notes", async () => {
    const list = await store.createList("Stairs");
    await store.saveItems(list.id, [item("austin-tx"), item("dallas-tx")]);
    const [first] = await store.getItems(list.id);
    await store.updateItem(first.id, { note: "call owner" });
    await store.saveItems(list.id, [item("austin-tx")]);
    const items = await store.getItems(list.id);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.cityId === "austin-tx")!.note).toBe("call owner");
    expect((await store.listLists())[0].itemCount).toBe(2);
  });

  it("the same city for different niches is a separate row", async () => {
    const list = await store.createList("Mixed");
    await store.saveItems(list.id, [item("austin-tx"), item("austin-tx", "plumber")]);
    expect(await store.getItems(list.id)).toHaveLength(2);
  });

  it("moves and copies rows between lists", async () => {
    const a = await store.createList("A");
    const b = await store.createList("B");
    await store.saveItems(a.id, [item("austin-tx"), item("dallas-tx"), item("houston-tx")]);
    const ids = (await store.getItems(a.id)).slice(0, 2).map((i) => i.id);
    await store.copyItems(ids.slice(0, 1), b.id, false);
    expect(await store.getItems(a.id)).toHaveLength(3);
    await store.copyItems(ids.slice(1), b.id, true);
    expect(await store.getItems(a.id)).toHaveLength(2);
    expect((await store.getItems(b.id)).map((i) => i.cityId).sort()).toEqual(["austin-tx", "dallas-tx"]);
    await store.removeItems((await store.getItems(b.id)).map((i) => i.id));
    expect(await store.getItems(b.id)).toHaveLength(0);
  });
});
