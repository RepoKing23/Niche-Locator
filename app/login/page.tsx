import LoginForm from "@/components/LoginForm";
import { safeNext } from "@/lib/safeNext";

export const metadata = { title: "Sign in · Niche Locator" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one below.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold">Niche Locator</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">Sign in to research niches and manage your keyword lists.</p>
      <LoginForm next={safeNext(typeof next === "string" ? next : null)}
        initialError={typeof error === "string" ? ERRORS[error] ?? "" : ""} />
    </main>
  );
}
