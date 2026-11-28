import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWine } from "./analyzeWine";
import { invokeAi } from "./aiTransport";
const api = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: api.getSession }, functions: { invoke: api.invoke } },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("scan transport", () => {
  it("preserves the existing Edge transport unless explicitly enabled", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "false");
    api.invoke.mockResolvedValue({ data: { wine: {} }, error: null });
    await analyzeWine({ text: "Wine" });
    expect(api.invoke).toHaveBeenCalledWith("analyze-wine", { body: { text: "Wine" } });
  });
  it("only sends the user JWT, not a provider/admin key, to a fixed same-origin path", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    api.getSession.mockResolvedValue({
      data: { session: { access_token: "synthetic-user-jwt" } },
      error: null,
    });
    const send = vi.fn(async () => Response.json({ wine: {} }));
    vi.stubGlobal("fetch", send);
    expect(await analyzeWine({ text: "Wine" })).toEqual({ data: { wine: {} }, error: null });
    expect(send.mock.calls[0]).toMatchObject([
      "/api/ai/analyze-wine",
      {
        cache: "no-store",
        redirect: "error",
        headers: { Authorization: "Bearer synthetic-user-jwt" },
      },
    ]);
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it("preserves HTTP status for the existing scan error UI and never falls back", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    api.getSession.mockResolvedValue({
      data: { session: { access_token: "synthetic" } },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429 })),
    );
    const result = await analyzeWine({ text: "Wine" });
    expect(result.error.context.status).toBe(429);
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it("does not send requests without a signed-in test session", async () => {
    vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
    api.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    expect((await analyzeWine({ text: "Wine" })).error.context.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Gemini client transport", () => {
  it.each(["ask-winesnap", "taste-suggestions", "wine-suggestions"] as const)(
    "sends %s to its fixed same-origin endpoint without a hosted fallback",
    async (name) => {
      vi.stubEnv("VITE_LOCAL_AI_ENABLED", "true");
      api.getSession.mockResolvedValue({
        data: { session: { access_token: "synthetic-user-jwt" } },
        error: null,
      });
      const send = vi.fn(async (_url: string) =>
        Response.json({ error: "unavailable" }, { status: 503 }),
      );
      vi.stubGlobal("fetch", send);
      expect((await invokeAi(name, {})).error.context.status).toBe(503);
      expect(send.mock.calls[0][0]).toBe(`/api/ai/${name}`);
      expect(api.invoke).not.toHaveBeenCalled();
    },
  );
});
