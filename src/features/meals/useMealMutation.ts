import { useEffect, useRef, useState } from "react";
import { MealMutationError, type MealAttempt } from "./mutations";

type Pending = { attempt: MealAttempt; saved: (value: unknown) => void; message: string };
type Recovery = { kind: "conflict" } | { kind: "read"; savedMessage?: string };
export function useMealMutation(owner: string, refresh: () => Promise<boolean>) {
  const alive = useRef(false),
    ownerRef = useRef(owner),
    locked = useRef(false);
  ownerRef.current = owner;
  const request = useRef<AbortController | null>(null),
    pending = useRef<Pending | null>(null),
    retryReady = useRef(false),
    recovery = useRef<Recovery | null>(null);
  const [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(false),
    [canRetry, setCanRetry] = useState(false),
    [notice, setNotice] = useState(""),
    [kind, setKind] = useState<"error" | "pending" | "success">("success"),
    [canReload, setCanReload] = useState(false);
  const current = () => alive.current && ownerRef.current === owner;
  useEffect(() => {
    alive.current = true;
    const offline = () => request.current?.abort();
    window.addEventListener("offline", offline);
    return () => {
      alive.current = false;
      request.current?.abort();
      pending.current = null;
      recovery.current = null;
      window.removeEventListener("offline", offline);
    };
  }, []);
  function offerRecovery(value: Recovery | null) {
    recovery.current = value;
    setCanReload(value !== null);
  }
  async function refreshSafely(signal: AbortSignal) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => (signal.aborted ? false : refresh())),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 15000);
          abort = () => resolve(false);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      if (abort) signal.removeEventListener("abort", abort);
    }
  }
  async function reload() {
    const previous = recovery.current;
    if (!previous || pending.current || locked.current || !current()) return;
    locked.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const reloaded = await refreshSafely(controller.signal);
      if (!current()) return;
      if (reloaded) {
        offerRecovery(null);
        setKind("success");
        setNotice(
          previous.kind === "conflict"
            ? "Aktuella uppgifter är inlästa. Ditt utkast finns kvar. Avbryt utkastet och öppna posten igen för att redigera den nya versionen."
            : (previous.savedMessage ? previous.savedMessage + " " : "") +
                "Aktuella uppgifter är inlästa.",
        );
      } else {
        setKind("error");
        setNotice(
          (previous.kind === "read" && previous.savedMessage ? previous.savedMessage + " " : "") +
            "Uppgifterna kunde inte läsas om. Kontrollera anslutning och behörighet och försök hämta igen.",
        );
      }
    } finally {
      if (request.current === controller) request.current = null;
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  async function execute(readOnly = false) {
    const operation = pending.current;
    if (!operation || locked.current || !current()) return;
    if (!navigator.onLine) {
      setKind("pending");
      setNotice("Offline. Anslut igen och kontrollera sparandet innan ett nytt försök.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setNotice("");
    const controller = new AbortController();
    request.current = controller;
    const scope = {
      owner,
      signal: controller.signal,
      current: () => current() && !controller.signal.aborted,
    };
    const timer = setTimeout(() => controller.abort(), 45000);
    let interrupted: (() => void) | undefined;
    try {
      const confirmed = await Promise.race([
        Promise.resolve().then(() => operation.attempt.execute(scope, readOnly)),
        new Promise<never>((_, reject) => {
          interrupted = () => reject(new MealMutationError("uncertain"));
          controller.signal.addEventListener("abort", interrupted, { once: true });
        }),
      ]);
      if (!current()) return;
      clearTimeout(timer);
      if (!confirmed) {
        retryReady.current = true;
        setKind("pending");
        setCanRetry(true);
        setNotice("Sparandet är inte bekräftat. Ett nytt försök använder samma uppgifter och ID.");
        return;
      }
      pending.current = null;
      retryReady.current = false;
      setWaiting(false);
      setCanRetry(false);
      operation.saved(operation.attempt.value);
      const reloaded = await refreshSafely(controller.signal);
      if (current()) {
        offerRecovery(reloaded ? null : { kind: "read", savedMessage: operation.message });
        setKind(reloaded ? "success" : "error");
        setNotice(
          reloaded
            ? operation.message
            : operation.message + " Listan kunde inte läsas om. Hämta aktuella uppgifter.",
        );
      }
    } catch (cause) {
      if (!current()) return;
      const kind = cause instanceof MealMutationError ? cause.kind : "uncertain";
      retryReady.current = false;
      if (
        !operation.attempt.started ||
        kind === "conflict" ||
        kind === "rejected" ||
        kind === "rate_limited"
      ) {
        setKind("error");
        pending.current = null;
        setWaiting(false);
        setCanRetry(false);
        offerRecovery(kind === "conflict" ? { kind: "conflict" } : { kind: "read" });
        setNotice(
          kind === "rate_limited"
            ? "För många försök. Vänta fem minuter."
            : kind === "conflict"
              ? "Uppgifterna har ändrats. Ditt utkast finns kvar. Hämta på nytt och öppna de aktuella uppgifterna innan du sparar."
              : "Kunde inte spara. Kontrollera val, anslutning och behörighet. Ditt utkast finns kvar.",
        );
      } else {
        setKind("pending");
        setCanRetry(false);
        setNotice(
          "Svaret saknas. Ändringen kan redan vara sparad. Kontrollera sparandet innan ett nytt försök.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (interrupted) controller.signal.removeEventListener("abort", interrupted);
      if (request.current === controller) request.current = null;
      locked.current = false;
      if (current()) setBusy(false);
    }
  }
  function run<T>(
    build: () => MealAttempt<T>,
    saved: (value: T) => void = () => {},
    message = "Sparat.",
  ) {
    if (!current() || locked.current || pending.current) return;
    try {
      const attempt = build();
      if (attempt.owner !== owner) throw new MealMutationError("changed");
      pending.current = { attempt, saved: (value) => saved(value as T), message };
      offerRecovery(null);
    } catch {
      setKind("error");
      setNotice("Kontrollera valen innan du sparar. Ditt utkast finns kvar.");
      return;
    }
    setWaiting(true);
    retryReady.current = false;
    setCanRetry(false);
    void execute();
  }
  return {
    run,
    busy,
    locked: busy || waiting,
    waiting,
    canRetry,
    notice,
    kind,
    canReload,
    reload,
    current,
    inspect: () => execute(true),
    retry: () => (retryReady.current ? execute() : Promise.resolve()),
  };
}
