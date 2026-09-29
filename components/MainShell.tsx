"use client";

import { usePathname } from "next/navigation";
import ListsManager from "./ListsManager";
import NicheLocator from "./NicheLocator";

/** Keeps both tabs mounted and only toggles which one is visible. */
export default function MainShell({ mode }: { mode: "live" | "demo" }) {
  const path = usePathname();
  const onLists = path.startsWith("/lists");
  return (
    <>
      <div className={onLists ? "hidden" : ""}>
        <NicheLocator mode={mode} />
      </div>
      <div className={onLists ? "" : "hidden"}>
        <ListsManager mode={mode} active={onLists} />
      </div>
    </>
  );
}
