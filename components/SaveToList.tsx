"use client";

import { useState } from "react";
import { getStore } from "@/lib/store";
import type { KeywordList, NewListItem } from "@/lib/types";

type Props = {
  /** Builds the rows to save when a list is chosen. */
  items: () => NewListItem[];
  count: number;
  flash: (message: string) => void;
  onSaved?: () => void;
  /** List to hide from the menu (e.g. the list currently open). */
  excludeListId?: string;
  label?: string;
  /** When set, the menu moves/copies existing items instead of saving new rows. */
  onPick?: (list: KeywordList) => Promise<void>;
};

/** "Save to list ▾" menu: pick an existing keyword list or create a new one. */
export default function SaveToList({ items, count, flash, onSaved, excludeListId, label = "Save to list", onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<KeywordList[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        setLists(await getStore().listLists());
      } catch (e) {
        flash((e as Error).message);
      }
    }
  };

  const saveTo = async (list: KeywordList) => {
    setBusy(true);
    try {
      if (onPick) await onPick(list);
      else {
        const n = await getStore().saveItems(list.id, items());
        flash(`Saved ${n} row${n === 1 ? "" : "s"} to “${list.name}”.`);
      }
      setOpen(false);
      onSaved?.();
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const list = await getStore().createList(newName);
      setNewName("");
      await saveTo(list);
    } catch (err) {
      flash((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button className="btn" disabled={!count || busy} onClick={toggle}
        title={count ? undefined : "Select rows first"}>
        {label} ({count}) ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="max-h-60 overflow-auto">
            {lists === null && <div className="p-2 text-sm text-zinc-500">Loading…</div>}
            {lists?.filter((l) => l.id !== excludeListId).map((l) => (
              <button key={l.id} disabled={busy} onClick={() => saveTo(l)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <span className="truncate">{l.name}</span>
                <span className="text-xs text-zinc-500">{l.itemCount}</span>
              </button>
            ))}
            {lists?.length === 0 && <div className="p-2 text-sm text-zinc-500">No lists yet.</div>}
          </div>
          <form onSubmit={createAndSave} className="mt-2 flex gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <input className="input flex-1" placeholder="New list name…" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-primary" disabled={busy || !newName.trim()}>Create</button>
          </form>
        </div>
      )}
    </div>
  );
}
