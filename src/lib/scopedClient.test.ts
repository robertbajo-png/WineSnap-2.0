import { afterEach, describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: create }));
import { scopedClient } from "./scopedClient";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  create.mockClear();
});
describe("captured account clients", () => {
  it("bounds new account operations and keeps caller cancellation and private request guards", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
    vi.stubEnv("VITE_OWNED_BACKEND_ENABLED", "false");
    vi.stubEnv("VITE_OWNED_PUBLIC_ORIGIN", "");
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", request);
    scopedClient("synthetic", 15000);
    const controller = new AbortController();
    await create.mock.calls[0][2].global.fetch("https://example.invalid/rest/v1/wines", {
      signal: controller.signal,
    });
    const options = request.mock.calls[0][1] as RequestInit;
    expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
    controller.abort();
    expect(options.signal?.aborted).toBe(true);
  });
  it.each([0, -1, 75001, NaN])("rejects invalid request deadlines", (timeout) => {
    expect(() => scopedClient("synthetic", timeout)).toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    ["http://127.0.0.1:5212", "http://127.0.0.1:54323"],
    ["https://winesnap.boleoai.se", "https://winesnap.boleoai.se/backend"],
  ])("preserves approved routing from %s", async (origin, expected) => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54323");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
    vi.stubEnv("VITE_OWNED_BACKEND_ENABLED", "true");
    vi.stubEnv("VITE_OWNED_PUBLIC_ORIGIN", "https://winesnap.boleoai.se");
    vi.stubGlobal("window", { location: { origin } });
    scopedClient("captured-synthetic-token");
    expect(create.mock.calls[0][0]).toBe(expected);
    expect(await create.mock.calls[0][2].accessToken()).toBe("captured-synthetic-token");
    expect(create.mock.calls[0][2].auth.persistSession).toBe(false);
  });
});
