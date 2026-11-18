import { useCallback, useEffect, useRef, useState } from "react";
import type { RecipeVersion } from "../kitchen/domain";
import {
  loadPlannedRecipeVersions,
  loadWeekPlan,
  saveWeekPlan,
  WeekPlanError,
  type SavedWeekPlan,
} from "./api";
import { weekPlanSchema, type WeekPlan } from "./domain";

type Snapshot = { saved: SavedWeekPlan | null; plan: WeekPlan; versions: RecipeVersion[] };
type Intent = { document: WeekPlan; expectedRevision: number; requestId: string };
type Recovery = { kind: "conflict" | "unknown"; intent: Intent; remote?: Snapshot };
const identical = (a: WeekPlan, b: WeekPlan) => JSON.stringify(a) === JSON.stringify(b);
const emptyWeek = (weekStart: string): WeekPlan => ({
  weekStart,
  meals: [],
  manualItems: [],
  shoppingEdits: [],
});

// The caller keys the workspace by owner and week. No drafts are written to browser storage.
export function useWeekPlan(owner: string, weekStart: string, online: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<WeekPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [retry, setRetry] = useState<Intent | null>(null);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const dirty = !!(snapshot && draft && !identical(draft, snapshot.plan));

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
      if (!alive.current || operation.current || !online || !navigator.onLine) return null;
      const controller = new AbortController();
      operation.current = controller;
      setBusy(kind);
      const current = () => operation.current === controller && alive.current;
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
    [online, owner],
  );

  const read = useCallback(async () => {
    if (dirty && !recovery) return;
    const work = start("read");
    if (!work) return;
    try {
      const saved = await loadWeekPlan(work.scope, weekStart, work.signal);
      const plan = saved?.document ?? emptyWeek(weekStart);
      const versions = await loadPlannedRecipeVersions(work.scope, plan, work.signal);
      if (!work.current()) return;
      const remote = { saved, plan, versions };
      if (recovery) {
        const { intent } = recovery;
        if (
          saved?.last_request_id === intent.requestId &&
          saved.revision === intent.expectedRevision + 1 &&
          identical(plan, intent.document)
        ) {
          setSnapshot(remote);
          setDraft(plan);
          setRecovery(null);
          setRetry(null);
          setNotice("Veckoplanen var redan sparad.");
        } else if (
          recovery.kind === "unknown" &&
          (saved?.revision ?? 0) === intent.expectedRevision
        ) {
          setSnapshot(remote);
          setRecovery(null);
          setRetry(intent);
          setNotice("Sparandet kunde inte bekräftas. Utkastet finns kvar.");
        } else {
          setRecovery({ ...recovery, remote });
          setNotice("");
        }
      } else {
        setSnapshot(remote);
        setDraft(plan);
        setRetry(null);
        setNotice("");
      }
    } catch {
      if (work.current()) setNotice("Veckoplanen kunde inte hämtas.");
    } finally {
      work.finish();
    }
  }, [dirty, recovery, start, weekStart]);

  useEffect(() => {
    if (online && !snapshot && !notice) void read();
  }, [online, snapshot, notice, read]);

  function change(value: WeekPlan) {
    if (!snapshot || !alive.current || operation.current || recovery) return false;
    const parsed = weekPlanSchema.safeParse(value);
    if (!parsed.success) {
      setNotice("Ändringen fick inte plats i veckoplanen.");
      return false;
    }
    setDraft(parsed.data);
    setRetry(null);
    setNotice("");
    return true;
  }

  async function save() {
    if (!snapshot || !draft || !dirty || recovery) return;
    const work = start("save");
    if (!work) return;
    const expectedRevision = snapshot.saved?.revision ?? 0;
    const intent =
      retry && retry.expectedRevision === expectedRevision && identical(retry.document, draft)
        ? retry
        : { document: draft, expectedRevision, requestId: crypto.randomUUID() };
    setNotice("");
    try {
      const saved = await saveWeekPlan(work.scope, intent, work.signal);
      if (!work.current()) return;
      setSnapshot((value) => (value ? { ...value, saved, plan: saved.document } : value));
      setDraft(saved.document);
      setRetry(null);
      setNotice("Veckoplanen sparades.");
    } catch (error) {
      if (!work.current()) return;
      const kind = error instanceof WeekPlanError ? error.kind : "unknown";
      if (kind === "conflict" || kind === "unknown") setRecovery({ kind, intent });
      else setNotice("Veckoplanen kunde inte sparas. Utkastet finns kvar.");
    } finally {
      work.finish();
    }
  }

  function chooseRemote(keepDraft: boolean) {
    const remote = recovery?.remote;
    if (!remote || operation.current) return;
    setSnapshot({
      ...remote,
      versions: keepDraft
        ? [
            ...new Map(
              [...(snapshot?.versions ?? []), ...remote.versions].map((v) => [v.id, v]),
            ).values(),
          ]
        : remote.versions,
    });
    if (!keepDraft) setDraft(remote.plan);
    setRecovery(null);
    setRetry(null);
    setNotice(keepDraft ? "Utkastet är kvar. Ett nytt sparande ersätter den sparade planen." : "");
  }

  function discard() {
    if (!snapshot || operation.current || recovery) return;
    setDraft(snapshot.plan);
    setRetry(null);
    setNotice("");
  }

  return {
    draft,
    versions: snapshot?.versions ?? [],
    dirty,
    busy,
    notice,
    recovery,
    read,
    change,
    save,
    chooseRemote,
    discard,
  };
}
