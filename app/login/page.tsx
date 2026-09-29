import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in · Niche Locator" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold">Niche Locator</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">Sign in to research niches and manage your keyword lists.</p>
      <LoginForm />
    </main>
  );
}
