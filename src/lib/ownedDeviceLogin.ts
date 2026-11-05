import type { Session } from "@supabase/supabase-js";

const origin = "https://winesnap.boleoai.se";
const signedOutKey = "winesnap-device-signed-out";
let signedOut = false;
let pending: Promise<Session | null> | null = null;

export const ownedDeviceOrigin = () =>
  typeof window !== "undefined" &&
  import.meta.env.VITE_OWNED_BACKEND_ENABLED === "true" &&
  window.location.origin === origin;

export function markOwnedDeviceSignedOut() {
  if (!ownedDeviceOrigin()) return;
  signedOut = true;
  pending = null;
  try {
    sessionStorage.setItem(signedOutKey, "true");
  } catch {
    /* In-memory suppression remains active. */
  }
}

export function requestOwnedDeviceSession(): Promise<Session | null> {
  if (!ownedDeviceOrigin()) return Promise.resolve(null);
  const url = new URL(window.location.href);
  if (url.searchParams.get("device_login") === "1") {
    signedOut = false;
    try {
      sessionStorage.removeItem(signedOutKey);
    } catch {
      return Promise.resolve(null);
    }
    url.searchParams.delete("device_login");
    window.history.replaceState(window.history.state, "", url);
  }
  try {
    if (signedOut || sessionStorage.getItem(signedOutKey)) return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  if (!pending)
    pending = fetch("/api/owned/device-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WineSnap-Device": "sign-in" },
      body: "{}",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    })
      .then(async (response) => {
        if (!response.ok || signedOut) return null;
        const result = await response.json();
        return signedOut ? null : ((result.session as Session) ?? null);
      })
      .catch(() => null);
  return pending;
}

export async function leaveOwnedDeviceGate() {
  if (!ownedDeviceOrigin()) return;
  const response = await fetch("/gate/api/logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  if (!response.ok) throw new Error("Device sign-out unavailable");
  window.location.assign("/gate/?rd=" + encodeURIComponent(origin + "/?device_login=1"));
}
