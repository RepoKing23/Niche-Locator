/** Response of /api/account-status, shared by the header badge and the Account page. */
export type AccountStatus =
  | { configured: false }
  | { configured: true; login?: string; source?: "app" | "env"; balance?: number | null; error?: string };

/** Fired on window after the DataForSEO login changes so every badge reloads. */
export const ACCOUNT_CHANGED_EVENT = "dataforseo:changed";

export async function loadAccountStatus(): Promise<AccountStatus> {
  try {
    const res = await fetch("/api/account-status", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AccountStatus | { error?: string } | null;
    return json && "configured" in json ? json : { configured: true, error: json?.error ?? "Could not load credits" };
  } catch {
    return { configured: true, error: "Could not load credits" };
  }
}

export function formatBalance(balance: number | null | undefined): string {
  return balance != null ? `$${balance.toFixed(2)}` : "—";
}
