"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";

type Mode = "signin" | "signup" | "magic";

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  if (!supabaseConfigured) {
    return <p className="text-sm">Login is disabled because Supabase isn’t configured. <Link className="underline" href="/">Open the app</Link>.</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = getBrowserSupabase();
    const redirectTo = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        }
        else setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMessage("Check your email for a sign-in link.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex gap-1 text-sm">
        {(["signin", "signup", "magic"] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`flex-1 rounded px-2 py-1.5 ${mode === m ? "bg-sky-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
            {m === "signin" ? "Sign in" : m === "signup" ? "Create account" : "Email link"}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        Email
        <input type="email" required className="input mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== "magic" && (
        <label className="block text-sm">
          Password
          <input type="password" required minLength={6} className="input mt-1 w-full" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send sign-in link"}
      </button>
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </form>
  );
}
