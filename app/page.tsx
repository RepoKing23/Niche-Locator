import NicheLocator from "@/components/NicheLocator";
import { hasCredentials } from "@/lib/dataforseo";

export const dynamic = "force-dynamic";

export default function Home() {
  return <NicheLocator mode={hasCredentials() ? "live" : "demo"} />;
}
