import Link from "next/link";
import SignOutButton from "./SignOutButton";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUserEmail } from "@/lib/supabase/server";

/** Top bar: app name, page tabs, where data is stored, and the signed-in user. */
export default async function AppHeader({ active }: { active: "research" | "lists" }) {
  const email = await currentUserEmail();
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-sky-600 text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"}`}>
      {label}
    </Link>
  );
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Niche Locator</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">High ad value, weak organic competition — by US city.</p>
        </div>
        <nav className="flex gap-1">
          {tab("/", "Research", active === "research")}
          {tab("/lists", "Keyword Lists", active === "lists")}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {supabaseConfigured ? (
          <>
            <span className="text-zinc-600 dark:text-zinc-400">{email}</span>
            <SignOutButton />
          </>
        ) : (
          <span className="rounded-md bg-zinc-200 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            title="Add Supabase env vars to enable login and cloud storage">
            Saved in this browser only
          </span>
        )}
      </div>
    </header>
  );
}
