"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { RESET_COOKIE } from "@/lib/passwordReset";

export async function setNewPassword(_prev: string, formData: FormData): Promise<string> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) return "Use at least 6 characters.";
  if (password !== confirm) return "The passwords don’t match.";

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "Your reset link has expired. Request a new one from the sign-in page.";
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;

  (await cookies()).delete(RESET_COOKIE);
  redirect("/");
}
