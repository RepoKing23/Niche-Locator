"use client";

import { useActionState } from "react";
import { setNewPassword } from "./actions";

export default function ResetPasswordForm() {
  const [error, action, busy] = useActionState(setNewPassword, "");
  return (
    <form action={action} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="block text-sm">
        New password
        <input name="password" type="password" required minLength={6} autoComplete="new-password" className="input mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Confirm new password
        <input name="confirm" type="password" required minLength={6} autoComplete="new-password" className="input mt-1 w-full" />
      </label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : "Set new password"}</button>
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </form>
  );
}
