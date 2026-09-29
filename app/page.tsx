import AppHeader from "@/components/AppHeader";
import NicheLocator from "@/components/NicheLocator";
import { hasCredentials } from "@/lib/dataforseo";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6">
      <AppHeader active="research" />
      <NicheLocator mode={hasCredentials() ? "live" : "demo"} />
    </div>
  );
}
