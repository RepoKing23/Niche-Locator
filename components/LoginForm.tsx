"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";

type Mode = "signin" | "signup" | "magic" | "forgot";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "signin", label: "Sign in" },
  { mode: "signup", label: "Create account" },
  { mode: "magic", label: "Email link" },
];

const SUBMIT_LABEL: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create account",
  magic: "Send sign-in link",
  forgot: "Send reset link",
};

/** `next` is where to go after signing in (already checked by safeNext). */
export default function LoginForm({ next = "/", initialError = "" }: { next?: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const router = useRouter();

  if (!supabaseConfigured) {
    return <p className="text-sm">Login is disabled because Supabase isn’t configured. <Link className="underline" href="/">Open the app</Link>.</p>;
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setMessage("");
  };

  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = getBrowserSupabase();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        }
        else setMessage("Check your email to confirm your account, then sign in.");
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } });
        if (error) throw error;
        setMessage("Check your email for a sign-in link.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/account?reset=1") });
        if (error) throw error;
        setMessage("If that email has an account, a link to set a new password is on its way.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {mode === "forgot" ? (
        <p className="text-sm">Enter your email and we’ll send you a link to set a new password.</p>
      ) : (
        <div className="flex gap-1 text-sm">
          {TABS.map((t) => (
            <button key={t.mode} type="button" onClick={() => switchMode(t.mode)}
              className={`flex-1 rounded px-2 py-1.5 ${mode === t.mode ? "bg-sky-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <label className="block text-sm">
        Email
        <input type="email" required autoComplete="email" className="input mt-1 w-full" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      {(mode === "signin" || mode === "signup") && (
        <label className="block text-sm">
          Password
          <input type="password" required minLength={6} className="input mt-1 w-full" value={password}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : SUBMIT_LABEL[mode]}</button>
      {mode === "signin" && (
        <button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => switchMode("forgot")}>
          Forgot password?
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="text-sm text-sky-700 underline dark:text-sky-400" onClick={() => switchMode("signin")}>
          Back to sign in
        </button>
      )}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </form>
  );
}
