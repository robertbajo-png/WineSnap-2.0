import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as imageModule from "../../supabase/functions/wine-image/handler";

const owner = "33333333-3333-4333-8333-333333333333";
const path = `${owner}/label with space.png`;
function setup(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "https://test.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-private-canary",
    WINE_IMAGE_PROXY_ENABLED: "true",
    ...overrides,
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const rpc = vi.fn(async (name: string) => ({
    data: name === "privacy_account_active",
    error: null as unknown,
  }));
  const admin = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) },
    rpc,
  };
  const createClient = vi.fn().mockReturnValue(admin);
  const fetch = vi
    .fn()
    .mockImplementation(
      async () => new Response("synthetic-image", { headers: { "Content-Type": "image/png" } }),
    );
  const output = transpileModule(
    readFileSync(new URL("../../supabase/functions/wine-image/index.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    },
  ).outputText;
  runInNewContext(output, {
    exports: {},
    require: (name: string) => {
      if (name === "npm:@supabase/supabase-js@2.105.1") return { createClient };
      if (name === "./handler.ts") return imageModule;
      throw new Error("Unexpected runtime import");
    },
    Deno: {
      env: { get: (name: string) => env[name] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    URL,
    Request,
    Response,
    AbortSignal,
    crypto,
    fetch,
    Error,
  });
  if (!handler) throw new Error("Image handler was not registered");
  return {
    createClient,
    admin,
    fetch,
    env,
    call: (body: unknown = { path }, token: string | null = "synthetic-user-token") =>
      handler!(
        new Request("https://test.example.invalid/functions/v1/wine-image", {
          method: "POST",
          body: JSON.stringify(body),
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ),
  };
}

describe("actual image runtime adapter", () => {
  it("is disabled unless explicitly enabled and fails closed on missing configuration", async () => {
    for (const env of [
      { WINE_IMAGE_PROXY_ENABLED: undefined },
      { SUPABASE_SERVICE_ROLE_KEY: undefined },
      { SUPABASE_URL: undefined },
    ]) {
      const api = setup(env);
      expect((await api.call()).status).toBe(503);
      expect(api.createClient).not.toHaveBeenCalled();
      expect(api.fetch).not.toHaveBeenCalled();
    }
  });

  it("verifies the user and active account, pins Storage origin/bucket and never returns the service key", async () => {
    const api = setup();
    const response = await api.call();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("synthetic-image");
    expect(api.admin.auth.getUser).toHaveBeenCalledWith("synthetic-user-token");
    expect(api.admin.rpc).toHaveBeenCalledWith("privacy_account_active", { _user_id: owner });
    const [target, options] = api.fetch.mock.calls[0];
    expect(target.origin).toBe("https://test.example.invalid");
    expect(target.pathname).toBe(
      `/storage/v1/object/wine-labels/${owner}/label%20with%20space.png`,
    );
    expect(target.searchParams.get("cacheNonce")).toBeTruthy();
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect([...response.headers.values()].join(" ")).not.toContain(
      api.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  });

  it("checks shared-image permission for anonymous requests instead of inventing an owner", async () => {
    const api = setup();
    api.admin.rpc.mockResolvedValue({ data: true, error: null });
    expect((await api.call({ path }, null)).status).toBe(200);
    expect(api.admin.auth.getUser).not.toHaveBeenCalled();
    expect(api.admin.rpc).toHaveBeenCalledWith("is_public_wine_photo", { _storage_path: path });
  });

  it("does not fetch image bytes when Auth or permission checks fail", async () => {
    const api = setup();
    api.admin.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    expect((await api.call()).status).toBe(401);
    expect(api.fetch).not.toHaveBeenCalled();
    api.admin.auth.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    api.admin.rpc.mockResolvedValue({ data: false, error: null });
    expect((await api.call()).status).toBe(404);
    api.admin.rpc.mockResolvedValue({ data: false, error: new Error("private-diagnostic") });
    expect((await api.call()).status).toBe(503);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://user:secret@example.invalid",
    "https://example.invalid?secret=x",
    "https://example.invalid/nested",
    "http://remote.example.invalid",
  ])("rejects unsafe backend origin %s", async (url) => {
    const api = setup({ SUPABASE_URL: url });
    expect((await api.call()).status).toBe(503);
    expect(api.fetch).not.toHaveBeenCalled();
  });
});
