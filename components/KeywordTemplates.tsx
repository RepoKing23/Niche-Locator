"use client";

import { useEffect, useState } from "react";
import { getStore } from "@/lib/store";
import type { KeywordTemplate } from "@/lib/types";

/** Library of saved keyword sets: load one into the Keyword Check field, or save the field as one. */
export default function KeywordTemplates({ keywords, onLoad }: {
  keywords: string[];
  onLoad: (keywords: string[], replace: boolean) => void;
}) {
  const [templates, setTemplates] = useState<KeywordTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      setTemplates(await getStore().listTemplates());
    } catch (e) {
      setMessage(`Could not load templates: ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    void (async () => refresh())();
  }, []);

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage((cur) => (cur === m ? "" : cur)), 4000);
  };

  const save = async () => {
    if (!keywords.length) return flash("Add keywords to the field first.");
    const name = window.prompt(`Save these ${keywords.length} keywords as a template. Name:`, selected?.name ?? "")?.trim();
    if (!name) return;
    if (name.length > 100) return flash("Template names can be up to 100 characters.");
    const clash = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (clash && !window.confirm(`Replace the keywords in template “${clash.name}”?`)) return;
    try {
      const t = await getStore().saveTemplate(clash?.name ?? name, keywords);
      await refresh();
      setSelectedId(t.id);
      flash(`Saved template “${t.name}” (${keywords.length} keywords).`);
    } catch (e) {
      flash(`Could not save: ${(e as Error).message}`);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Delete template “${selected.name}”?`)) return;
    try {
      await getStore().deleteTemplate(selected.id);
      setSelectedId("");
      await refresh();
      flash(`Deleted “${selected.name}”.`);
    } catch (e) {
      flash(`Could not delete: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Templates</span>
      <select className="input min-w-0 max-w-full flex-1 py-1 text-xs sm:max-w-64" value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">{templates.length ? "Pick a saved template…" : "No templates yet"}</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.keywords.length})</option>)}
      </select>
      <button className="btn py-1 text-xs" disabled={!selected} title="Replace the field with this template's keywords"
        onClick={() => selected && onLoad(selected.keywords, true)}>Load</button>
      <button className="btn py-1 text-xs" disabled={!selected} title="Add this template's keywords to the field"
        onClick={() => selected && onLoad(selected.keywords, false)}>Add</button>
      <button className="btn py-1 text-xs" disabled={!selected} onClick={remove}>Delete</button>
      <button className="btn py-1 text-xs" disabled={!keywords.length} onClick={save}>Save field as template…</button>
      {message && <span className="w-full text-xs text-zinc-500">{message}</span>}
    </div>
  );
}
