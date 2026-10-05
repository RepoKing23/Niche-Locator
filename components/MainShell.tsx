"use client";

import { usePathname } from "next/navigation";
import KeywordChecker from "./KeywordChecker";
import ListsManager from "./ListsManager";
import NicheLocator from "./NicheLocator";

/** Keeps every tab mounted and only toggles which one is visible, so results survive tab switches. */
export default function MainShell({ mode }: { mode: "live" | "demo" }) {
  const path = usePathname();
  const tab = path.startsWith("/lists") ? "lists" : path.startsWith("/check") ? "check" : "research";
  return (
    <>
      <div className={tab === "research" ? "" : "hidden"}>
        <NicheLocator mode={mode} />
      </div>
      <div className={tab === "check" ? "" : "hidden"}>
        <KeywordChecker mode={mode} />
      </div>
      <div className={tab === "lists" ? "" : "hidden"}>
        <ListsManager mode={mode} active={tab === "lists"} />
      </div>
    </>
  );
}
