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
