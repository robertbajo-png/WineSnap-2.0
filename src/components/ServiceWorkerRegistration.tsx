import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed", error);
      });
    }
  }, []);
  return null;
}
