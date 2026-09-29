import AppHeader from "@/components/AppHeader";
import ListsManager from "@/components/ListsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keyword Lists · Niche Locator" };

export default function ListsPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6">
      <AppHeader active="lists" />
      <ListsManager />
    </div>
  );
}
