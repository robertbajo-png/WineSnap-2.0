import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), scoped: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session, getUser: mocks.user } },
}));
vi.mock("./scopedClient", () => ({ scopedClient: mocks.scoped }));
import { loadOverviewWines, requestOverviewPrices } from "./cellarOverviewStore";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let current: boolean;
const scope = { owner, current: () => current };
const request = { action: "refresh" as const, wineIds: [id(1)] };
const reply = { results: [{ wineId: id(1), status: "matched" }] };
const signal = () => new AbortController().signal;
const fetchMock = vi.fn();
let rows: { id: string; user_id: string }[];
let ranges: number[];
let failPage: number | undefined;
let missing: boolean;
let invalidateRead: boolean;
let selections: string[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  current = true;
  rows = [{ id: id(1), user_id: owner }];
  ranges = [];
  selections = [];
  missing = false;
  invalidateRead = false;
  failPage = undefined;
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: owner }, access_token: "synthetic-owner-token" } },
    error: null,
  });
  mocks.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  fetchMock.mockResolvedValue(new Response(JSON.stringify(reply)));
  mocks.scoped.mockImplementation(() => ({
    from(table: string) {
      expect(table).toBe("wines");
      let from = 0,
        to = 499,
        columns = "",
        ids: string[] | undefined;
      const query = {
        select(value: string) {
          columns = value;
          selections.push(value);
          return query;
        },
        eq(key: string, value: string) {
          expect([key, value]).toEqual(["user_id", owner]);
          return query;
        },
        order(key: string) {
          expect(key).toBe("id");
          return query;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          return query;
        },
        in(key: string, value: string[]) {
          expect(key).toBe("id");
          ids = value;
          return query;
        },
        abortSignal(value: AbortSignal) {
          expect(value).toBeInstanceOf(AbortSignal);
          return query;
        },
        then(resolve: (result: unknown) => unknown) {
          ranges.push(from);
          if (invalidateRead) current = false;
          return Promise.resolve(
            resolve({
              data: rows.filter((r) => !ids || ids.includes(r.id)).slice(from, to + 1),
              error:
                missing && columns.includes("retail_price_status")
                  ? { code: "42703" }
                  : from === failPage
                    ? { code: "synthetic_read_error" }
                    : null,
            }),
          );
        },
      };
      return query;
    },
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("account-bound overview reads", () => {
  it("loads every page using the verified ordinary JWT", async () => {
    rows = Array.from({ length: 1001 }, (_, i) => ({ id: id(i + 1), user_id: owner }));
    expect((await loadOverviewWines(scope, signal())).wines).toHaveLength(1001);
    expect(ranges).toEqual([0, 500, 1000]);
    expect(mocks.scoped).toHaveBeenCalledExactlyOnceWith("synthetic-owner-token", 15000);
  });
  it("discards partial data when a later page fails", async () => {
    rows = Array.from({ length: 501 }, (_, i) => ({ id: id(i + 1), user_id: owner }));
    failPage = 500;
    await expect(loadOverviewWines(scope, signal())).rejects.toEqual({
      code: "synthetic_read_error",
    });
  });
  it("retains the legacy-schema fallback without enabling price writes", async () => {
    missing = true;
    const result = await loadOverviewWines(scope, signal());
    expect(result.ready).toBe(false);
    expect(result.wines).toHaveLength(1);
    expect(selections[1]).not.toContain("retail_price_status");
    expect(mocks.session).toHaveBeenCalledTimes(1);
  });
  it("limits read-back to the captured IDs", async () => {
    rows.push({ id: id(2), user_id: owner });
    expect((await loadOverviewWines(scope, signal(), [id(2)])).wines.map((r) => r.id)).toEqual([
      id(2),
    ]);
  });
  it("rejects an unexpected owner instead of displaying their totals", async () => {
    rows[0].user_id = "peer";
    await expect(loadOverviewWines(scope, signal())).rejects.toThrow("invalid_overview_rows");
  });
  it("rejects a late read after its owner view is invalidated", async () => {
    invalidateRead = true;
    await expect(loadOverviewWines(scope, signal())).rejects.toThrow("account_scope_changed");
  });
});

describe("bounded price transport", () => {
  it("does not look up a session or send after cancellation", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(requestOverviewPrices(scope, request, abort.signal)).rejects.toThrow(
      "account_scope_changed",
    );
    expect(mocks.session).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds stalled session lookup and ignores its late result", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    mocks.session.mockImplementation(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const pending = expect(requestOverviewPrices(scope, request, signal())).rejects.toThrow(
      "account_verification_timeout",
    );
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    finish({ data: { session: { user: { id: owner }, access_token: "synthetic-late" } } });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["session", "user"] as const)(
    "rejects a switched %s before the price request",
    async (stage) => {
      if (stage === "session")
        mocks.session.mockResolvedValue({ data: { session: { user: { id: "peer" } } } });
      else mocks.user.mockResolvedValue({ data: { user: { id: "peer" } } });
      await expect(requestOverviewPrices(scope, request, signal())).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("captures and verifies the ordinary token, with private no-redirect transport", async () => {
    expect(await requestOverviewPrices(scope, request, signal())).toEqual(reply);
    expect(mocks.user).toHaveBeenCalledExactlyOnceWith("synthetic-owner-token");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/public/hooks/refresh-cellar-values",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: {
          Authorization: "Bearer synthetic-owner-token",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(mocks.scoped).not.toHaveBeenCalled();
  });
  it("ignores a late successful price response after account change", async () => {
    fetchMock.mockImplementation(async () => {
      current = false;
      return new Response(JSON.stringify(reply));
    });
    await expect(requestOverviewPrices(scope, request, signal())).rejects.toThrow(
      "account_scope_changed",
    );
  });
  it("cancels between headers and parsed response", async () => {
    const abort = new AbortController();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        abort.abort();
        return reply;
      },
    });
    await expect(requestOverviewPrices(scope, request, abort.signal)).rejects.toThrow(
      "account_scope_changed",
    );
  });
  it("bounds a stalled HTTP request without automatically retrying", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => reject(new Error("synthetic_timeout")), {
            once: true,
          }),
        ),
    );
    const pending = expect(requestOverviewPrices(scope, request, signal())).rejects.toThrow(
      "synthetic_timeout",
    );
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    [503, { error: "migration_required" }, "migration_required"],
    [503, null, "price_request_failed"],
    [200, { results: [] }, null],
  ] as const)("handles HTTP %s safely", async (status, value, message) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value), { status }));
    const pending = requestOverviewPrices(scope, request, signal());
    if (message) await expect(pending).rejects.toThrow(message);
    else expect(await pending).toEqual(value);
  });
  it("rejects malformed success data", async () => {
    fetchMock.mockResolvedValue(new Response('{"unexpected":"synthetic"}'));
    await expect(requestOverviewPrices(scope, request, signal())).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
