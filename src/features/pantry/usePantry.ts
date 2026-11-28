import { useCallback, useEffect, useRef, useState } from "react";
import { loadPantry, PantryError, savePantryItem } from "./api";
import type { PantrySnapshot } from "./domain";

type MutationKind = "conflict" | "unknown" | "invalid" | "unavailable";
export type PantryEditResult = { ok: true } | { ok: false; kind: MutationKind };

// Kitchen keys its workspace by owner. Keep this private snapshot in memory only.
export function usePantry(owner: string, online: boolean, opened: boolean) {
  const [snapshot, setSnapshot] = useState<PantrySnapshot | null>();
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      operation.current = null;
    };
  }, []);

  const start = useCallback(
    (kind: "read" | "save") => {
      if (!opened || !online || !navigator.onLine || !alive.current || operation.current)
        return null;
      const controller = new AbortController();
      operation.current = controller;
      setBusy(kind);
      const current = () => alive.current && operation.current === controller;
      return {
        scope: { owner, current },
        signal: controller.signal,
        current,
        finish() {
          if (!current()) return;
          operation.current = null;
          setBusy(null);
        },
      };
    },
    [online, opened, owner],
  );

  const reload = useCallback(async () => {
    const task = start("read");
    if (!task) return undefined;
    setSnapshot(undefined);
    setError(false);
    try {
      const value = await loadPantry(task.scope, task.signal);
      if (!task.current()) return undefined;
      setSnapshot(value);
      return value;
    } catch {
      if (task.current()) setError(true);
      return undefined;
    } finally {
      task.finish();
    }
  }, [start]);

  useEffect(() => {
    if (!online || !opened) {
      setSnapshot(undefined);
      return;
    }
    const refresh = () => {
      if (document.visibilityState !== "hidden") void reload();
    };
    void reload();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [online, opened, reload]);

  async function save(input: Parameters<typeof savePantryItem>[1]): Promise<PantryEditResult> {
    const task = start("save");
    if (!task) return { ok: false, kind: "unavailable" };
    try {
      const value = await savePantryItem(task.scope, input, task.signal);
      if (!task.current()) return { ok: false, kind: "unavailable" };
      setSnapshot(value);
      setError(false);
      return { ok: true };
    } catch (problem) {
      const kind = problem instanceof PantryError ? problem.kind : "unknown";
      if (task.current() && kind !== "invalid") {
        setSnapshot(undefined);
        setError(true);
      }
      return { ok: false, kind };
    } finally {
      task.finish();
    }
  }

  return {
    snapshot: opened && online ? snapshot : undefined,
    busy,
    error,
    reload,
    save,
  };
}
