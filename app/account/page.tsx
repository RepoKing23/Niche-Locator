import Link from "next/link";
import { redirect } from "next/navigation";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import SignOutButton from "@/components/SignOutButton";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUserEmail } from "@/lib/supabase/server";

export const metadata = { title: "Account · Niche Locator" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  if (!supabaseConfigured) redirect("/");
  const email = await currentUserEmail();
  if (!email) redirect("/login?next=/account");
  const { reset } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <div>
        <Link href="/" className="text-sm text-sky-700 underline dark:text-sky-400">← Back to Niche Locator</Link>
        <h1 className="mt-2 text-2xl font-bold">Account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Signed in as <strong>{email}</strong></p>
      </div>
      {reset === "1" && <p className="text-sm text-emerald-700 dark:text-emerald-400">Choose a new password below.</p>}
      <ChangePasswordForm />
      <div><SignOutButton /></div>
    </main>
  );
}
