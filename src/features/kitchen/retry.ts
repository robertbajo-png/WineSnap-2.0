type RetryOptions = {
  run: () => Promise<unknown>;
  canRun: () => boolean;
  focus: EventTarget;
  visibility: EventTarget;
};

export function retryPendingCookingSync({ run, canRun, focus, visibility }: RetryOptions) {
  let stopped = false;
  let working = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (!stopped)
      timer = setTimeout(
        () => void attempt(),
        Math.min(30000, 5000 * 2 ** Math.min(attempts++, 3)),
      );
  };
  async function attempt() {
    if (stopped || working) return;
    clearTimeout(timer);
    if (!canRun()) {
      schedule();
      return;
    }
    working = true;
    try {
      await run();
    } catch {
      // The workspace owns error display and decides whether retries remain eligible.
    } finally {
      working = false;
      schedule();
    }
  }
  const foreground = () => void attempt();
  focus.addEventListener("focus", foreground);
  visibility.addEventListener("visibilitychange", foreground);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    focus.removeEventListener("focus", foreground);
    visibility.removeEventListener("visibilitychange", foreground);
  };
}
