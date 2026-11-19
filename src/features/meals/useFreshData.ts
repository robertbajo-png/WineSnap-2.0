import { useCallback, useEffect, useRef, useState } from "react";

// Shared preferences are never cached offline; a failed/revoked fetch clears the visible copy.
export function useFreshData<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0),
    alive = useRef(false),
    loader = useRef(load),
    pending = useRef<AbortController | null>(null);
  loader.current = load;
  const refresh = useCallback(async (background = false) => {
    if (!alive.current || (background && pending.current)) return false;
    pending.current?.abort();
    pending.current = null;
    const generation = ++sequence.current;
    if (!navigator.onLine) {
      setData(null);
      setError("Anslut till internet för att hämta aktuella uppgifter.");
      return false;
    }
    const controller = new AbortController();
    pending.current = controller;
    let interrupted: (() => void) | undefined;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new Error("fresh_read_cancelled");
          return loader.current(controller.signal);
        }),
        new Promise<never>((_, reject) => {
          interrupted = () => reject(new Error("fresh_read_cancelled"));
          controller.signal.addEventListener("abort", interrupted, { once: true });
        }),
      ]);
      if (alive.current && generation === sequence.current && !controller.signal.aborted) {
        setData(result);
        setError("");
        return true;
      }
    } catch {
      if (alive.current && generation === sequence.current) {
        setData(null);
        setError("Uppgifterna kunde inte hämtas. Kontrollera anslutning och behörighet.");
      }
    } finally {
      clearTimeout(timer);
      if (interrupted) controller.signal.removeEventListener("abort", interrupted);
      if (pending.current === controller) pending.current = null;
    }
    return false;
  }, []);
  useEffect(() => {
    alive.current = true;
    const reload = () => {
      if (document.visibilityState !== "hidden") void refresh(true);
    };
    const disconnected = () => {
      ++sequence.current;
      pending.current?.abort();
      pending.current = null;
      setData(null);
      setError("Offline. Delade uppgifter är dolda.");
    };
    void refresh();
    const timer = window.setInterval(reload, 15000);
    window.addEventListener("online", reload);
    window.addEventListener("offline", disconnected);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      alive.current = false;
      // This is a request generation counter, not a DOM ref; invalidate in-flight reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++sequence.current;
      pending.current?.abort();
      pending.current = null;
      window.clearInterval(timer);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh]);
  return { data, error, refresh };
}
