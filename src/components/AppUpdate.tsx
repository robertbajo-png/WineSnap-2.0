import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AppUpdate() {
  const t = useT();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activating = useRef(false);
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
  const activateUpdate = () => {
    if (!waiting || activating.current) return;
    activating.current = true;
    const reload = () => window.location.reload();
    try {
      navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      waiting.postMessage("SKIP_WAITING");
    } catch {
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
      activating.current = false;
      setError(t("pwa.failed"));
    }
  };
  if (!waiting) return null;
  return (
    <>
      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 max-w-[calc(100%-2rem)]">
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 rounded-md border border-gold bg-background px-3 text-sm text-gold disabled:opacity-50"
          disabled={activating.current}
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("pwa.update")}
        </button>
        {error && (
          <p role="alert" className="mt-2 bg-background p-2 text-sm text-cream">
            {error}
          </p>
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg border-gold/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-gold">{t("pwa.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-cream/90">
              {t("pwa.confirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={activateUpdate} disabled={activating.current}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("pwa.reload")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
