import { useEffect, useRef, useState } from "react";
import { useFreshData } from "../meals/useFreshData";
import { ChefError, foodMemory, type FoodMemoryScope } from "./api";

type Recovery = "none" | "read" | "uncertain" | "review";
export function useFoodMemoryState(owner: string, offline: boolean, onChanged: () => void) {
  const fresh = useFreshData((signal) => foodMemory(owner, signal));
  const alive = useRef(false),
    ownerRef = useRef(owner),
    working = useRef(false);
  ownerRef.current = owner;
  const active = useRef<AbortController | null>(null);
  const recoveryRef = useRef<Recovery>("none");
  const [recovery, setRecovery] = useState<Recovery>("none");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const current = () => alive.current && ownerRef.current === owner;
  function recover(value: Recovery) {
    recoveryRef.current = value;
    setRecovery(value);
  }
  useEffect(() => {
    alive.current = true;
    const disconnected = () => active.current?.abort();
    window.addEventListener("offline", disconnected);
    return () => {
      alive.current = false;
      active.current?.abort();
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  async function reload() {
    if (!current() || working.current || offline || !navigator.onLine) return;
    working.current = true;
    setBusy(true);
    try {
      const loaded = await fresh.refresh();
      if (!current()) return;
      if (loaded) {
        if (recoveryRef.current === "uncertain" || recoveryRef.current === "review") {
          recover("review");
          setNotice(
            "Aktuella uppgifter är inlästa. Granska om ändringen redan finns och avsluta försöket utan att spara igen.",
          );
        } else recover("none");
        setError("");
      }
    } finally {
      working.current = false;
      if (current()) setBusy(false);
    }
  }
  async function run(
    action: (scope: FoodMemoryScope) => Promise<unknown>,
    message: string,
    saved: () => void = () => {},
    deadline: 45000 | 75000 = 45000,
  ) {
    if (
      !current() ||
      working.current ||
      offline ||
      !navigator.onLine ||
      !fresh.data ||
      fresh.error ||
      recoveryRef.current !== "none"
    )
      return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), deadline);
    let interrupted: (() => void) | undefined;
    let committed = false;
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          if (!current() || controller.signal.aborted)
            throw new Error("memory_operation_cancelled");
          return action({
            signal: controller.signal,
            current: () => current() && !controller.signal.aborted,
          });
        }),
        new Promise<never>((_, reject) => {
          interrupted = () => reject(new Error("memory_operation_cancelled"));
          controller.signal.addEventListener("abort", interrupted, { once: true });
        }),
      ]);
      if (!current()) return;
      committed = true;
      clearTimeout(timer);
      saved();
      onChanged();
      setNotice(message);
      const loaded = await fresh.refresh();
      if (current() && !loaded) {
        recover("read");
        setNotice(message + " Uppgifterna kunde inte läsas om. Hämta på nytt.");
      }
    } catch (cause) {
      if (!current()) return;
      if (committed) {
        recover("read");
        setError("");
        setNotice(message + " Uppgifterna kunde inte läsas om. Hämta på nytt.");
        return;
      }
      const known = cause instanceof ChefError && [401, 403, 409, 422, 429].includes(cause.status);
      recover(known ? "read" : "uncertain");
      setError(
        known
          ? cause.message
          : "Svaret saknas. Ändringen kan redan vara sparad. Hämta aktuella uppgifter innan du gör något mer.",
      );
      onChanged();
    } finally {
      clearTimeout(timer);
      if (interrupted) controller.signal.removeEventListener("abort", interrupted);
      if (active.current === controller) active.current = null;
      working.current = false;
      if (current()) setBusy(false);
    }
  }
  const needsRead = recovery === "read" || recovery === "uncertain";
  return {
    data: needsRead || offline ? null : fresh.data,
    loadState:
      !fresh.data && !fresh.error ? "loading" : needsRead || fresh.error ? "error" : "ready",
    requiresRead: needsRead,
    busy,
    error,
    notice,
    reload,
    run,
    uncertain: recovery === "uncertain" || recovery === "review",
    reviewReady: recovery === "review" && !!fresh.data && !fresh.error && !offline,
    finishUncertain() {
      if (
        !current() ||
        working.current ||
        recoveryRef.current !== "review" ||
        !fresh.data ||
        fresh.error ||
        offline
      )
        return false;
      recover("none");
      setError("");
      setNotice("Försöket är avslutat. Ingen ny ändring har skickats.");
      return true;
    },
  };
}
