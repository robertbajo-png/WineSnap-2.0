/**
 * Helpers for the password-recovery flow.
 *
 * Never trust a redirect target supplied by the user (query string, hash,
 * storage). Only same-origin, single-slash paths are allowed.
 */

const RESET_PATH = "/reset-password";

/** Absolute, same-origin URL that Supabase is allowed to send the user back to. */
export function recoveryRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${RESET_PATH}`;
}

/**
 * Sanitize a "where to go after reset" value.
 * Returns "/" for anything that is not a plain same-origin path.
 */
export function safeInternalPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  // "//evil.com" and "/\evil.com" are protocol-relative URLs.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("://")) return "/";
  return value;
}

/** True when the URL carries a Supabase recovery grant. */
export function hasRecoveryGrant(hash: string, search: string): boolean {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const s = new URLSearchParams(search.replace(/^\?/, ""));
  if (h.get("type") === "recovery" && h.get("access_token")) return true;
  if (s.get("type") === "recovery" && (s.get("token_hash") || s.get("code"))) return true;
  if (s.get("code")) return true;
  return false;
}

/** True when the URL reports an expired/invalid recovery link. */
export function recoveryLinkError(hash: string, search: string): string | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const s = new URLSearchParams(search.replace(/^\?/, ""));
  return h.get("error_code") || h.get("error") || s.get("error_code") || s.get("error") || null;
}
