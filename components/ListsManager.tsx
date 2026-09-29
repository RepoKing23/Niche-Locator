"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccurateRun from "./AccurateRun";
import DataTable, { type ActionContext } from "./DataTable";
import SaveToList from "./SaveToList";
import type { Column } from "./columns";
import { accuracyLabel } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { CityRow, KeywordList, ListItem } from "@/lib/types";

/** Keyword manager: named lists of saved rows, with notes, move/copy, and exports. */
/** `active` = this tab is visible; data is refreshed each time it becomes visible. */
export default function ListsManager({ mode, active: visible = true }: { mode: "live" | "demo"; active?: boolean }) {
  const [lists, setLists] = useState<KeywordList[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const store = getStore;

  const loadLists = useCallback(async () => {
    try {
      const ls = await store().listLists();
      setLists(ls);
      setActiveId((cur) => (cur && ls.some((l) => l.id === cur) ? cur : ls[0]?.id ?? null));
    } catch (e) {
      setError((e as Error).message);
      setLists([]);
    }
  }, [store]);

  const loadItems = useCallback(async (listId: string | null) => {
    if (!listId) return setItems([]);
    setLoadingItems(true);
    try {
      setItems(await store().getItems(listId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingItems(false);
    }
  }, [store]);

  // Refresh when the tab is shown (rows may have been saved from Research meanwhile).
  useEffect(() => {
    if (visible) void (async () => loadLists())();
  }, [visible, loadLists]);

  useEffect(() => {
    if (visible) void (async () => loadItems(activeId))();
  }, [visible, activeId, loadItems]);

  const active = lists?.find((l) => l.id === activeId) ?? null;

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    void act(async () => {
      const l = await store().createList(newName);
      setNewName("");
      await loadLists();
      setActiveId(l.id);
    });
  };

  const renameList = (id: string, name: string) =>
    act(async () => {
      if (name.trim()) await store().renameList(id, name);
      setRenaming(null);
      await loadLists();
    });

  const deleteList = (l: KeywordList) => {
    if (!window.confirm(`Delete “${l.name}” and its ${l.itemCount} saved rows?`)) return;
    void act(async () => {
      await store().deleteList(l.id);
      await loadLists();
    });
  };

  // The table keys rows by id, so each saved item gets its own id (same city can appear for several niches).
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rows: CityRow[] = useMemo(() => items.map((i) => ({ ...i.row, id: i.id })), [items]);

  const saveNote = useCallback((id: string, note: string) => {
    const item = byId.get(id);
    if (!item || item.note === note) return;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, note } : i)));
    void getStore().updateItem(id, { note }).catch((e: Error) => setError(e.message));
  }, [byId]);

  const extraColumns: Column[] = useMemo(() => [
    { key: "niche", label: "Niche", defaultVisible: true, help: "Niche researched", value: (r) => byId.get(r.id)?.niche ?? null },
    {
      key: "note", label: "Note", defaultVisible: true, help: "Your note (click to edit)",
      value: (r) => byId.get(r.id)?.note ?? "",
      render: (r) => <NoteCell key={r.id} value={byId.get(r.id)?.note ?? ""} onSave={(v) => saveNote(r.id, v)} />,
    },
    {
      key: "accuracy", label: "Data", defaultVisible: true,
      help: "Exact = live SERP + Google Ads city volume; SERP checked = live SERP only; Estimated = from national data. Use “Accurate data” to upgrade rows.",
      value: (r) => accuracyLabel(r),
      render: (r) => {
        const a = accuracyLabel(r);
        const cls = a === "Exact" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
          : a === "SERP checked" ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
        return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{a}</span>;
      },
    },
    {
      key: "saved", label: "Saved", defaultVisible: false, help: "Date saved to the list",
      value: (r) => byId.get(r.id)?.createdAt.slice(0, 10) ?? null,
    },
  ], [byId, saveNote]);

  const searchText = useCallback((r: CityRow) => {
    const i = byId.get(r.id);
    return i ? `${i.niche} ${i.note}` : "";
  }, [byId]);

  const exportList = async (ctx: ActionContext) => {
    if (!active) return;
    try {
      const { buildListWorkbook, downloadWorkbook, listFilename } = await import("@/lib/reportWorkbook");
      const picked = ctx.target.map((r) => byId.get(r.id)!).filter(Boolean);
      await downloadWorkbook(buildListWorkbook(active.name, picked, ctx.scope), listFilename(active.name));
    } catch (e) {
      ctx.flash(`Export failed: ${(e as Error).message}`);
    }
  };

  const removeRows = (ctx: ActionContext) => {
    if (!window.confirm(`Remove ${ctx.target.length} rows from “${active?.name}”?`)) return;
    void act(async () => {
      await store().removeItems(ctx.target.map((r) => r.id));
      ctx.clearSelection();
      await Promise.all([loadItems(activeId), loadLists()]);
    });
  };

  const transfer = (ctx: ActionContext, move: boolean) => async (to: KeywordList) => {
    await store().copyItems(ctx.target.map((r) => r.id), to.id, move);
    ctx.flash(`${move ? "Moved" : "Copied"} ${ctx.target.length} rows to “${to.name}”.`);
    if (move) ctx.clearSelection();
    await Promise.all([loadItems(activeId), loadLists()]);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm font-semibold">Your lists</div>
        <form onSubmit={createList} className="flex gap-1">
          <input className="input flex-1" placeholder="New list…" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary" disabled={!newName.trim()}>Add</button>
        </form>
        {lists === null && <div className="text-sm text-zinc-500">Loading…</div>}
        {lists?.length === 0 && (
          <p className="text-sm text-zinc-500">
            No lists yet. Run a search on the Research tab, tick rows, and use <b>Save to list</b>.
          </p>
        )}
        <ul className="space-y-1">
          {lists?.map((l) => (
            <li key={l.id}>
              {renaming === l.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void renameList(l.id, (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value); }}>
                  <input name="name" autoFocus defaultValue={l.name} className="input w-full"
                    onBlur={(e) => void renameList(l.id, e.target.value)} />
                </form>
              ) : (
                <div className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${l.id === activeId ? "bg-sky-100 dark:bg-sky-900/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                  <button className="flex-1 truncate text-left" onClick={() => setActiveId(l.id)}>{l.name}</button>
                  <span className="text-xs text-zinc-500">{l.itemCount}</span>
                  <button className="hidden text-xs text-zinc-500 group-hover:inline" title="Rename" onClick={() => setRenaming(l.id)}>✎</button>
                  <button className="hidden text-xs text-rose-600 group-hover:inline" title="Delete" onClick={() => deleteList(l)}>✕</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className="min-w-0 space-y-3">
        {error && <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">{error}</div>}
        {active ? (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{active.name}</h2>
              <span className="text-sm text-zinc-500">{items.length} saved rows{loadingItems && " · loading…"}</span>
            </div>
            <DataTable
              key={active.id}
              rows={rows}
              exportName={`${active.name} keyword list`}
              extraColumns={extraColumns}
              searchText={searchText}
              actions={(ctx) => (
                <>
                  <AccurateRun mode={mode} flash={ctx.flash}
                    items={ctx.target.map((r) => byId.get(r.id)!).filter(Boolean)}
                    onUpdated={(updated) => {
                      const map = new Map(updated.map((u) => [u.id, u]));
                      setItems((cur) => cur.map((i) => map.get(i.id) ?? i));
                    }} />
                  <button className="btn-primary" disabled={!ctx.target.length} onClick={() => exportList(ctx)}
                    title="Excel workbook: Summary, Rows (with niche & notes), SERP Details">
                    Full report (Excel)
                  </button>
                  <SaveToList label="Move to" count={ctx.target.length} flash={ctx.flash} items={() => []}
                    excludeListId={active.id} onPick={transfer(ctx, true)} />
                  <SaveToList label="Copy to" count={ctx.target.length} flash={ctx.flash} items={() => []}
                    excludeListId={active.id} onPick={transfer(ctx, false)} />
                  <button className="btn" disabled={!ctx.target.length} onClick={() => removeRows(ctx)}>Remove</button>
                </>
              )}
            />
          </>
        ) : (
          lists && lists.length > 0 && <p className="text-sm text-zinc-500">Pick a list.</p>
        )}
      </main>
    </div>
  );
}

function NoteCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input className="w-48 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-zinc-300 focus:border-sky-500 focus:outline-none dark:hover:border-zinc-700"
      placeholder="Add note…" value={text} onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text.trim())} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}
