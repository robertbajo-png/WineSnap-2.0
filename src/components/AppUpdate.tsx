import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n";

export function AppUpdate() {
  const t = useT();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const offer = () => {
          if (!cancelled && registration.waiting) setWaiting(registration.waiting);
        };
        offer();
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", offer);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!waiting) return null;
  return (
    <button
      className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex min-h-11 items-center gap-2 rounded-md border border-gold bg-background px-3 text-sm text-gold"
      onClick={() => {
        if (!window.confirm(t("pwa.confirm"))) return;
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true },
        );
        waiting.postMessage("SKIP_WAITING");
      }}
    >
      <RefreshCw className="h-4 w-4" />
      {t("pwa.update")}
    </button>
  );
}
