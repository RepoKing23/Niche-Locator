"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs() {
  const path = usePathname();
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-sky-600 text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"}`}>
      {label}
    </Link>
  );
  const onLists = path.startsWith("/lists");
  const onCheck = path.startsWith("/check");
  return (
    <nav className="flex gap-1">
      {tab("/", "Research", !onLists && !onCheck)}
      {tab("/check", "Keyword Check", onCheck)}
      {tab("/lists", "Keyword Lists", onLists)}
    </nav>
  );
}
