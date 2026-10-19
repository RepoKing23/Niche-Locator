"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ACCOUNT_CHANGED_EVENT, formatBalance, loadAccountStatus, type AccountStatus } from "@/lib/accountStatus";

const REFRESH_MS = 60_000;

/**
 * Header badge: the DataForSEO login in use and its remaining credit. Refreshes on click,
 * on window focus, every minute, and right after the login is changed on the Account page.
 */
export default function CreditsWidget({ settingsHref }: { settingsHref?: string }) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(await loadAccountStatus());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, load);
    const timer = setInterval(onFocus, REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, load);
      clearInterval(timer);
    };
  }, [load]);

  const settings = settingsHref && (
    <Link href={settingsHref} className="text-xs text-sky-700 hover:underline dark:text-sky-400" title="Change the DataForSEO login">
      Change
    </Link>
  );

  if (!status) {
    return <span className="rounded-md bg-zinc-200 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">DataForSEO…</span>;
  }
  if (!status.configured) {
    return (
      <span className="flex items-center gap-2">
        <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="Add a DataForSEO login to use real data">
          DataForSEO not connected
        </span>
        {settings}
      </span>
    );
  }

  const low = status.balance != null && status.balance < 1;
  const tone = status.error
    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
    : low
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";

  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={load} disabled={loading}
        className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${tone} disabled:opacity-70`}
        title={status.error ? `${status.error} — click to retry` : "DataForSEO account in use and credit left — click to refresh"}>
        <span className="font-medium">DataForSEO</span>
        {status.login && <span className="max-w-[16rem] truncate">{status.login}</span>}
        <span className="font-semibold tabular-nums">{status.error ? "error" : formatBalance(status.balance)}</span>
        {loading && <span aria-hidden>↻</span>}
      </button>
      {settings}
    </span>
  );
}
