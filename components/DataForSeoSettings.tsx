"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ACCOUNT_CHANGED_EVENT, formatBalance, loadAccountStatus, type AccountStatus } from "@/lib/accountStatus";

/** Shows the DataForSEO login in use and lets a signed-in user replace it (checked, then saved in Supabase). */
export default function DataForSeoSettings() {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => setStatus(await loadAccountStatus()), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { load(); }, [load]);

  const changed = async () => {
    await load();
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch("/api/dataforseo-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save the login");
      setPassword("");
      setMessage(`Connected as ${json.login} · ${formatBalance(json.balance)} credit. The app now uses this login.`);
      await changed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useEnv = async () => {
    if (!window.confirm("Remove the saved login and use the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars instead?")) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch("/api/dataforseo-credentials", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not remove the login");
      setMessage("Saved login removed. Using the env vars.");
      await changed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="dataforseo" onSubmit={submit}
      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">DataForSEO API</h2>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        {!status ? "Loading…"
          : !status.configured ? "Not connected — the app shows sample data."
            : (
              <>
                Using <strong>{status.login}</strong>{" "}
                ({status.source === "app" ? "saved here" : "from env vars"}) ·{" "}
                {status.error ? <span className="text-rose-700 dark:text-rose-400">{status.error}</span> : <>{formatBalance(status.balance)} credit</>}
              </>
            )}
      </div>
      <label className="block text-sm">
        API login
        <input type="text" required autoComplete="off" className="input mt-1 w-full" placeholder="you@example.com"
          value={login} onChange={(e) => setLogin(e.target.value)} />
      </label>
      <label className="block text-sm">
        API password
        <input type="password" required autoComplete="new-password" className="input mt-1 w-full"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <p className="text-xs text-zinc-500">
        From <a href="https://app.dataforseo.com/api-access" target="_blank" rel="noreferrer" className="underline">app.dataforseo.com/api-access</a> —
        the API password, not your website password. It is checked before saving and applies to everyone signed in.
      </p>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Checking…" : "Save & resync"}</button>
      {status?.configured && status.source === "app" && (
        <button type="button" onClick={useEnv} disabled={busy} className="w-full text-xs text-zinc-600 underline dark:text-zinc-400">
          Use the env vars instead
        </button>
      )}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </form>
  );
}
