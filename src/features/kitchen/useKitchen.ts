import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveRecipe,
  KitchenError,
  loadKitchen,
  saveCookingSession,
  saveRecipe,
  serverSession,
  verifyKitchenOwner,
} from "./api";
import {
  emptyKitchenCache,
  readKitchenCache,
  writeKitchenCache,
  clearKitchenCache,
  type KitchenCache,
} from "./storage";
import {
  initialCookingState,
  validState,
  type CookingFeedback,
  type CookingState,
  type LocalSession,
  type RecipeDocument,
  type RecipeVersion,
} from "./domain";

export function useKitchen(owner: string | undefined) {
  const [cache, setCache] = useState<KitchenCache | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<LocalSession | null>(null);
  const ref = useRef<KitchenCache | null>(null);
  const ownerRef = useRef(owner);
  const running = useRef(false);
  const generation = useRef(0);
  ownerRef.current = owner;
  function update(value: KitchenCache) {
    ref.current = value;
    setCache(value);
  }
  const message = (cause: unknown) =>
    cause instanceof KitchenError && cause.kind === "unavailable"
      ? "Köket är inte tillgängligt för kontot. Logga in igen eller kontakta administratören."
      : cause instanceof KitchenError && cause.kind === "conflict"
        ? "Receptet eller sessionen har ändrats. Hämta den senaste versionen innan du fortsätter."
        : cause instanceof Error && cause.message === "kitchen_local_conflict"
          ? "Köket ändrades i en annan flik. Hämta uppdateringen innan du fortsätter."
          : "Ändringen kunde inte synkas. Dina lokalt sparade steg behålls. Försök igen när anslutningen fungerar.";
  const persist = useCallback(async (value: KitchenCache, expected = value.cacheRevision) => {
    const current = generation.current;
    if (ownerRef.current !== value.owner) throw new Error("Account changed");
    const next = await writeKitchenCache(value, expected);
    if (ownerRef.current !== value.owner || generation.current !== current) {
      throw new Error("Account changed");
    }
    ref.current = next;
    setCache(next);
    return next;
  }, []);
  async function flush(value: KitchenCache) {
    if (!value.session?.dirty || !navigator.onLine) return;
    await verifyKitchenOwner(value.owner);
    try {
      const saved = await saveCookingSession(value.session);
      if (saved.user_id !== value.owner || saved.id !== value.session.id)
        throw new KitchenError("unavailable");
      await persist({
        ...value,
        verifiedAt: Date.now(),
        session: { ...value.session, baseRevision: saved.revision, dirty: false },
        history: value.history.map((item) =>
          item.id === saved.id ? { ...item, baseRevision: saved.revision, dirty: false } : item,
        ),
      });
      setConflict(null);
    } catch (cause) {
      if (
        cause instanceof KitchenError &&
        cause.kind === "conflict" &&
        ownerRef.current === value.owner
      ) {
        const remote = await serverSession(value.owner, value.session.id);
        const active = remote ?? (await loadKitchen(value.owner)).active;
        if (ownerRef.current === value.owner) setConflict(active);
      }
      throw cause;
    }
  }
  async function run(action: (value: KitchenCache) => Promise<void>) {
    if (!owner || running.current || !ref.current || ref.current.owner !== owner) return false;
    const current = generation.current;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action(ref.current);
      return true;
    } catch (cause) {
      if (ownerRef.current === owner && generation.current === current) {
        setError(message(cause));
        if (cause instanceof KitchenError && cause.kind === "unavailable") {
          await clearKitchenCache();
          ref.current = null;
          setCache(null);
          setConflict(null);
        }
      }
      return false;
    } finally {
      if (generation.current === current) {
        running.current = false;
        if (ownerRef.current === owner) setBusy(false);
      }
    }
  }
  useEffect(() => {
    const current = ++generation.current;
    ref.current = null;
    setCache(null);
    setReady(false);
    setError("");
    setConflict(null);
    running.current = false;
    setBusy(false);
    const valid = () => current === generation.current && ownerRef.current === owner;
    async function load() {
      if (!owner) {
        if (valid()) setReady(true);
        return;
      }
      let local: KitchenCache | null = null;
      try {
        await clearKitchenCache(owner);
        try {
          local = await readKitchenCache(owner);
        } catch {
          await clearKitchenCache();
        }
        if (!valid()) return;
        if (!navigator.onLine) {
          if (!local) throw new Error("Connect to download recipes");
          update(local);
          return;
        }
        const remote = await loadKitchen(owner);
        if (!valid()) return;
        const next = local
          ? {
              ...local,
              versions: remote.versions,
              history:
                local.session?.dirty &&
                ["completed", "abandoned"].includes(local.session.state.status)
                  ? [
                      local.session,
                      ...remote.history.filter((item) => item.id !== local?.session?.id),
                    ].slice(0, 20)
                  : remote.history,
              verifiedAt: Date.now(),
              session: local.session?.dirty
                ? local.session
                : (remote.active ??
                  (local.session?.state.status === "completed" ? local.session : null)),
            }
          : {
              ...emptyKitchenCache(owner, remote.versions, remote.active),
              history: remote.history,
            };
        await persist(next);
      } catch (cause) {
        if (valid()) {
          setError(message(cause));
          if (local && cause instanceof KitchenError && cause.kind === "network") {
            update(local);
          }
          if (cause instanceof KitchenError && cause.kind === "unavailable") {
            await clearKitchenCache();
            ref.current = null;
            setCache(null);
          }
        }
      } finally {
        if (valid()) setReady(true);
      }
    }
    void load();
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      generation.current = current + 1;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [owner, persist]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const value = ref.current;
      if (value && Date.now() - value.verifiedAt > 86400000) {
        ref.current = null;
        setCache(null);
        setConflict(null);
        setError("Anslut och logga in igen för att verifiera åtkomsten till offlinekopian.");
        void clearKitchenCache().catch(() => undefined);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (offline || !ready || !cache?.session?.dirty || running.current || conflict) return;
    // Foreground reconnect performs the same owner/active-account checks as a manual sync.
    const timer = window.setTimeout(() => {
      void run(flush);
    }, 500);
    return () => window.clearTimeout(timer);
    // Retry only on a real connection change or a newly loaded session, not on repeated failures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, ready]);
  async function change(state: CookingState, feedback: CookingFeedback | null = null) {
    let localSaved = false;
    const synchronized = await run(async (value) => {
      if (!value.session || conflict) throw new KitchenError("conflict");
      const session = {
        ...value.session,
        state: validState(state, value.session.version.document),
        feedback,
        requestId: crypto.randomUUID(),
        dirty: true,
      };
      const history = ["completed", "abandoned"].includes(state.status)
        ? [session, ...value.history.filter((item) => item.id !== session.id)].slice(0, 20)
        : value.history;
      const next = await persist({ ...value, session, history });
      localSaved = true;
      await flush(next);
    });
    // A persisted offline completion may close its dialog while sync remains visibly pending.
    return synchronized || localSaved;
  }
  async function begin(version: RecipeVersion, servings: number) {
    let localSaved = false;
    const synchronized = await run(async (value) => {
      if (
        version.user_id !== value.owner ||
        (value.session && ["running", "paused"].includes(value.session.state.status))
      )
        throw new KitchenError("conflict");
      const session: LocalSession = {
        id: crypto.randomUUID(),
        version,
        state: initialCookingState(version.document, servings),
        feedback: null,
        baseRevision: 0,
        requestId: crypto.randomUUID(),
        dirty: true,
      };
      const next = await persist({ ...value, session });
      localSaved = true;
      await flush(next);
    });
    return synchronized || localSaved;
  }
  async function save(
    document: RecipeDocument,
    recipeId: string,
    versionId: string,
    revision: number,
  ) {
    let result: RecipeVersion | null = null;
    const success = await run(async (value) => {
      if (!navigator.onLine) throw new KitchenError("network");
      await verifyKitchenOwner(value.owner);
      result = await saveRecipe(recipeId, versionId, revision, document);
      if (result.user_id !== value.owner) throw new KitchenError("unavailable");
      await persist({
        ...value,
        verifiedAt: Date.now(),
        versions: [result, ...value.versions.filter((item) => item.recipe_id !== recipeId)],
      });
    });
    return success ? result : null;
  }
  async function archive(version: RecipeVersion) {
    return run(async (value) => {
      if (!navigator.onLine) throw new KitchenError("network");
      await verifyKitchenOwner(value.owner);
      await archiveRecipe(version.recipe_id, version.revision);
      await persist({
        ...value,
        versions: value.versions.filter((item) => item.recipe_id !== version.recipe_id),
      });
    });
  }
  async function acceptRemote() {
    return run(async (value) => {
      if (conflict) {
        await persist({ ...value, session: conflict });
        setConflict(null);
      }
    });
  }
  async function keepLocal() {
    return run(async (value) => {
      if (
        !conflict ||
        !value.session ||
        conflict.id !== value.session.id ||
        ["completed", "abandoned"].includes(conflict.state.status)
      )
        throw new KitchenError("conflict");
      const next = await persist({
        ...value,
        session: {
          ...value.session,
          baseRevision: conflict.baseRevision,
          requestId: crypto.randomUUID(),
        },
      });
      setConflict(null);
      await flush(next);
    });
  }
  return {
    cache: cache?.owner === owner ? cache : null,
    busy,
    ready,
    offline,
    error,
    conflict,
    change,
    begin,
    save,
    archive,
    acceptRemote,
    keepLocal,
    sync: () => run(flush),
    reload: () => window.location.reload(),
  };
}
