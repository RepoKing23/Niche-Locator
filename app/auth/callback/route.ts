import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { RESET_COOKIE, RESET_COOKIE_MAX_AGE, RESET_PATH } from "@/lib/passwordReset";

/**
 * Completes magic-link, email-confirmation and password-reset sign-ins. Handles both
 * the default `?code=` links and `?token_hash=&type=` links from custom email templates.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  let next = safeNext(params.get("next"));

  const supabase = await createServerSupabase();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (!ok) return NextResponse.redirect(new URL("/login?error=link", request.url));

  const isReset = type === "recovery" || next === RESET_PATH;
  if (isReset) next = RESET_PATH;
  const response = NextResponse.redirect(new URL(next, request.url));
  if (isReset) {
    response.cookies.set(RESET_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: RESET_COOKIE_MAX_AGE });
  } else {
    response.cookies.delete(RESET_COOKIE);
  }
  return response;
}
