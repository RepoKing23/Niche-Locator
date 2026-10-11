import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUserEmail } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "Set a new password · Niche Locator" };
export const dynamic = "force-dynamic";

/** Where password-reset email links land. The proxy keeps the user here until they set a password. */
export default async function ResetPasswordPage() {
  if (!supabaseConfigured) redirect("/");
  const email = await currentUserEmail();
  if (!email) redirect("/login?error=link");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <div>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Choose a new password for <strong>{email}</strong> to continue.</p>
      </div>
      <ResetPasswordForm />
      <div><SignOutButton /></div>
    </main>
  );
}
