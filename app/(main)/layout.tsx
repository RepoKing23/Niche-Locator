import AppHeader from "@/components/AppHeader";
import MainShell from "@/components/MainShell";
import { hasCredentials } from "@/lib/dataforseo";

export const dynamic = "force-dynamic";

/**
 * Shared by the Research and Keyword Lists tabs. Layouts stay mounted when you switch
 * between their pages, so MainShell keeps both tabs (and their results, filters and any
 * running check) alive; the pages themselves render nothing.
 */
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6">
      <AppHeader />
      <MainShell mode={hasCredentials() ? "live" : "demo"} />
      {children}
    </div>
  );
}
