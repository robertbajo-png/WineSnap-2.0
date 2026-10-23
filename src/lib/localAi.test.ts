import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createAiAccessGuard } from "../../supabase/functions/_shared/aiAccess";
import { handleLocalLabelReading } from "./localAi.server";

const doubles = vi.hoisted(() => ({
  lstat: vi.fn(),
  readFile: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ lstat: doubles.lstat, readFile: doubles.readFile }));
vi.mock("@supabase/supabase-js", () => ({ createClient: doubles.createClient }));
const project = "pzniyupmgwvlldvztzqh";
const keys = {
  version: 1,
  project,
  publishable: "sb_publishable_synthetic",
  secret: "sb_secret_synthetic",
  openai: "sk-synthetic-never-a-real-provider-key",
};
const request = (
  body: unknown = { text: "Zehn Morgen 2023" },
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost/api/ai/analyze-wine", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-token",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WINESNAP_LOCAL_AI_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", `https://${project}.supabase.co`);
  doubles.lstat.mockImplementation(async (path: string) => ({
    uid: process.getuid?.(),
    mode: path.endsWith(".json") ? 0o600 : 0o700,
    size: 1000,
    isSymbolicLink: () => false,
    isFile: () => path.endsWith(".json"),
    isDirectory: () => !path.endsWith(".json"),
  }));
  doubles.readFile.mockResolvedValue(JSON.stringify(keys));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("test-only Node AI boundary", () => {
  it.each(["https://example.invalid", "https://production.invalid"])(
    "refuses other backends: %s",
    async (origin) => {
      vi.stubEnv("SUPABASE_URL", origin);
      expect((await handleLocalLabelReading(request())).status).toBe(503);
      expect(doubles.readFile).not.toHaveBeenCalled();
    },
  );
  it("is off by default even if inherited provider keys exist", async () => {
    vi.stubEnv("WINESNAP_LOCAL_AI_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "not-usable-as-fallback");
    expect((await handleLocalLabelReading(request())).status).toBe(503);
    expect(doubles.readFile).not.toHaveBeenCalled();
  });
  it.each(["", "Bearer ", "Basic synthetic"])(
    "rejects malformed/absent auth %s before reading secrets",
    async (authorization) => {
      const response = await handleLocalLabelReading(request(undefined, { authorization }));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(doubles.readFile).not.toHaveBeenCalled();
    },
  );
  it("requires JSON", async () => {
    expect(
      (await handleLocalLabelReading(request(undefined, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(doubles.readFile).not.toHaveBeenCalled();
  });
  it.each([
    { imageUrl: "http://127.0.0.1/private" },
    { text: "Wine", model: "other-model" },
    { text: "Wine", OPENAI_API_KEY: "caller-supplied-key" },
    { text: "a".repeat(12_001) },
    { imageBase64: "not-base64!" },
    {},
  ])("rejects unsupported/oversized input without auth or provider expense", async (body) => {
    expect((await handleLocalLabelReading(request(body))).status).toBe(400);
    expect(doubles.createClient).not.toHaveBeenCalled();
  });
  it("enforces a streaming byte limit independent of content-length", async () => {
    const response = await handleLocalLabelReading(
      request({ imageBase64: "a".repeat(18_100_001) }),
    );
    expect(response.status).toBe(400);
    expect(doubles.createClient).not.toHaveBeenCalled();
  });
  it("rejects redirected, shared, oversized or foreign credentials without disclosing them", async () => {
    for (const stat of [
      { isSymbolicLink: () => true },
      { mode: 0o644 },
      { size: 20_000, isDirectory: () => false, isFile: () => true },
    ]) {
      doubles.lstat.mockResolvedValue({
        uid: process.getuid?.(),
        mode: 0o600,
        size: 100,
        isSymbolicLink: () => false,
        ...stat,
      });
      const response = await handleLocalLabelReading(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(keys.openai);
    }
    expect(doubles.createClient).not.toHaveBeenCalled();
  });
  it("validates the session remotely, not merely a decoded JWT", async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: new Error("private") }));
    doubles.createClient.mockReturnValue({ auth: { getUser } });
    const response = await handleLocalLabelReading(request());
    expect(response.status).toBe(401);
    expect(getUser).toHaveBeenCalledWith("synthetic-token");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.text()).not.toContain("private");
  });
});

describe("shared Edge/Node AI access guard", () => {
  const options = { functionName: "analyze-wine", limit: 20, windowSeconds: 300, corsHeaders: {} };
  function guard(active: unknown, quota: unknown, quotaError: unknown = null) {
    const rpc = vi.fn(async (name: string) =>
      name === "privacy_account_active"
        ? { data: active, error: null }
        : { data: quota, error: quotaError },
    );
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "owner" } }, error: null })) },
      rpc,
    };
    return {
      rpc,
      call: () =>
        createAiAccessGuard(
          () => "synthetic-server-value",
          () => client,
        )(request(), options),
    };
  }
  it("enforces the existing atomic database quota with the verified user ID", async () => {
    const api = guard(true, [{ allowed: true, remaining: 19, reset_at: new Date().toISOString() }]);
    expect(await api.call()).toEqual({ userId: "owner", remaining: 19 });
    expect(api.rpc).toHaveBeenLastCalledWith("consume_ai_quota", {
      _user_id: "owner",
      _function_name: "analyze-wine",
      _limit: 20,
      _window_seconds: 300,
    });
  });
  it("blocks erased/inactive accounts before consuming quota", async () => {
    const api = guard(false, []);
    expect(((await api.call()) as Response).status).toBe(403);
    expect(api.rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves 429 and Retry-After", async () => {
    const api = guard(true, [
      { allowed: false, reset_at: new Date(Date.now() + 60_000).toISOString() },
    ]);
    const response = (await api.call()) as Response;
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it.each([null, [], {}])("fails closed with missing/malformed quota %j", async (quota) => {
    expect(((await guard(true, quota).call()) as Response).status).toBe(429);
  });
  it("fails closed on quota errors", async () => {
    expect(((await guard(true, null, new Error("private")).call()) as Response).status).toBe(500);
  });
});
