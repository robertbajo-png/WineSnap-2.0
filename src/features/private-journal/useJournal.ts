import { useCallback, useEffect, useRef, useState } from "react";
import { exportJournal, JournalRequestError, sendJournal } from "./client";
import type { JournalCommand, JournalState } from "./domain";

export function useJournal(owner: string, offline: boolean) {
  const [data, setData] = useState<Awaited<ReturnType<typeof sendJournal>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const request = useRef<AbortController | null>(null);
  const clear = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setData(undefined);
    setBusy(false);
  }, []);

  const run = useCallback(
    async (command: JournalCommand | "export", exportState?: JournalState) => {
      if (request.current || !navigator.onLine || document.hidden) return false;
      const abort = new AbortController();
      request.current = abort;
      const current = () => request.current === abort && !abort.signal.aborted && !document.hidden;
      const scope = { owner, current };
      const update = command !== "export" && command.action !== "read";
      setBusy(true);
      setError("");
      if (command !== "export" && command.action === "disable") setData(undefined);
      try {
        if (command === "export") {
          if (
            !exportState ||
            (!exportState.goalChoice.enabled && !exportState.readingsChoice.enabled)
          )
            return false;
          const result = await exportJournal(exportState, scope, abort.signal);
          if (!current()) return false;
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
          );
          try {
            const link = document.createElement("a");
            link.href = url;
            link.download = "winesnap-privat-journal.json";
            link.click();
          } finally {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        } else {
          const next = await sendJournal(command, scope, abort.signal);
          if (!current()) return false;
          setData(next);
        }
        return true;
      } catch (failure) {
        if (!current()) return false;
        setData(undefined);
        setError(
          failure instanceof JournalRequestError && [401, 403, 404].includes(failure.status)
            ? "Den privata vyn är inte tillgänglig för det här kontot eller den här anslutningen."
            : update
              ? "Ändringen kunde inte bekräftas. Läs om läget innan du försöker igen."
              : command === "export"
                ? "Exporten kunde inte bekräftas. Läs om läget och försök igen."
                : "Det gick inte att läsa dina privata uppgifter.",
        );
        return false;
      } finally {
        if (update) channel.current?.postMessage("refresh");
        if (request.current === abort) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [owner],
  );

  useEffect(() => {
    const refresh = () => {
      clear();
      if (!offline && !document.hidden && navigator.onLine) void run({ action: "read" });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    const crossTab =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("winesnap-private-state-v1");
    channel.current = crossTab;
    if (crossTab) crossTab.onmessage = refresh;
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("offline", clear);
    window.addEventListener("online", refresh);
    refresh();
    return () => {
      crossTab?.close();
      channel.current = null;
      request.current?.abort();
      request.current = null;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("offline", clear);
      window.removeEventListener("online", refresh);
    };
  }, [clear, offline, run]);

  useEffect(() => {
    if (!data?.validUntil) return;
    const deadline = Date.parse(data.validUntil);
    let timer = 0;
    const check = () => {
      const delay = deadline - Date.now();
      if (delay <= 0) {
        clear();
        if (!offline) void run({ action: "read" });
      } else {
        timer = window.setTimeout(check, Math.min(delay, 2_147_000_000));
      }
    };
    check();
    return () => window.clearTimeout(timer);
  }, [clear, data, offline, run]);

  return { state: data?.state, maintenancePaused: data?.maintenancePaused, busy, error, run };
}
