"use client";

import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn" onClick={async () => {
      await getBrowserSupabase().auth.signOut();
      router.replace("/login");
      router.refresh();
    }}>
      Sign out
    </button>
  );
}
