import { useCallback, useEffect, useRef, useState } from "react";

// Shared preferences are never cached offline; a failed/revoked fetch clears the visible copy.
export function useFreshData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0),
    alive = useRef(false),
    loader = useRef(load);
  loader.current = load;
  const refresh = useCallback(async () => {
    const generation = ++sequence.current;
    if (!navigator.onLine) {
      setData(null);
      setError("Anslut till internet för att hämta aktuella uppgifter.");
      return;
    }
    try {
      const result = await loader.current();
      if (alive.current && generation === sequence.current) {
        setData(result);
        setError("");
      }
    } catch {
      if (alive.current && generation === sequence.current) {
        setData(null);
        setError("Uppgifterna kunde inte hämtas. Kontrollera anslutning och behörighet.");
      }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const reload = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const disconnected = () => {
      ++sequence.current;
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
      window.clearInterval(timer);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh]);
  return { data, error, refresh };
}
