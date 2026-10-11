/**
 * Where to send the user after signing in. Only same-site paths are allowed, so a
 * crafted ?next= link can't bounce someone to another website.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/auth/")) return fallback;
  return next;
}
