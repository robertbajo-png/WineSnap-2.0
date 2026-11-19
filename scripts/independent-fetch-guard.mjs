// Preloaded ONLY by the local smoke test, never by the normal server command.
globalThis.fetch = async () => {
  console.error("INDEPENDENT_CHECK_OUTBOUND_FETCH_BLOCKED");
  throw new Error("Outbound fetch is disabled during independent runtime checks");
};
