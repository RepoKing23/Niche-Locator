import NavTabs from "./NavTabs";
import SignOutButton from "./SignOutButton";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUserEmail } from "@/lib/supabase/server";

/** Top bar: app name, page tabs, where data is stored, and the signed-in user. */
export default async function AppHeader() {
  const email = await currentUserEmail();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Niche Locator</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">High ad value, weak organic competition — by US city.</p>
        </div>
        <NavTabs />
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
