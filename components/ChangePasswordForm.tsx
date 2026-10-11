"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Sets a new password for the signed-in user (also used after a password-reset email). */
export default function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) return setError("The passwords don’t match.");
    setBusy(true);
    try {
      const { error } = await getBrowserSupabase().auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      setMessage("Password updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">Change password</h2>
      <label className="block text-sm">
        New password
        <input type="password" required minLength={6} autoComplete="new-password" className="input mt-1 w-full"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="block text-sm">
        Confirm new password
        <input type="password" required minLength={6} autoComplete="new-password" className="input mt-1 w-full"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : "Update password"}</button>
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </form>
  );
}
