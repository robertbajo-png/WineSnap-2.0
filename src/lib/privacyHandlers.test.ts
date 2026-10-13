import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as privacy from "../../supabase/functions/_shared/privacy";

type Handler = (request: Request) => Promise<Response>;
const owner = "33333333-3333-4333-8333-333333333333";
const secret = "synthetic-secret-".repeat(3);
function setup(name: string, env: Record<string, string> = {}) {
  let handler: Handler | undefined;
  const user = {
    id: owner,
    email: "owner@example.test",
    last_sign_in_at: new Date().toISOString(),
    user_metadata: {},
  };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const rpc = vi.fn(async (method: string) => ({
    data:
      method === "privacy_account_active"
        ? true
        : method === "consume_ai_quota"
          ? [{ allowed: true }]
          : method === "privacy_orphan_images" || method === "privacy_account_storage_objects"
            ? []
            : {},
    error: null,
  }));
  const remove = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc,
    from: vi.fn().mockReturnValue(chain),
    storage: { from: vi.fn().mockReturnValue({ remove }) },
  };
  const erase = vi.fn().mockResolvedValue({ complete: true });
  const logger = { error: vi.fn(), info: vi.fn() };
  const output = transpileModule(
    readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    },
  ).outputText;
  runInNewContext(output, {
    exports: {},
    require: (path: string) => {
      if (path === "../_shared/privacy.ts") return privacy;
      if (path === "../_shared/privacyRuntime.ts")
        return { privacyAdmin: () => admin, runAccountErasure: erase };
      throw new Error(`Unexpected import ${path}`);
    },
    Deno: {
      env: { get: (key: string) => env[key] },
      serve: (value: Handler) => {
        handler = value;
      },
    },
    Request,
    Response,
    Error,
    Date,
    TextEncoder,
    console: logger,
  });
  if (!handler) throw new Error("Missing handler");
  return {
    admin,
    rpc,
    chain,
    erase,
    remove,
    logger,
    call: (body: unknown = {}, token: string | null = "synthetic-token", method = "POST") =>
      handler!(
        new Request("https://db.example/function", {
          method,
          headers: token
            ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
            : {},
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        }),
      ),
  };
}

describe("actual privacy-control handler", () => {
  it("rejects anonymous callers and unsupported methods without mutations", async () => {
    const api = setup("privacy-controls");
    expect((await api.call({}, null)).status).toBe(401);
    expect((await api.call({}, null, "GET")).status).toBe(405);
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("requires matching action confirmation and recent authentication", async () => {
    const api = setup("privacy-controls");
    expect((await api.call({ action: "reset_memory" })).status).toBe(400);
    api.admin.auth.getUser.mockResolvedValue({
      data: { user: { id: owner, last_sign_in_at: "2020-01-01", email: "", user_metadata: {} } },
      error: null,
    });
    expect((await api.call({ action: "reset_memory", confirm: "reset_memory" })).status).toBe(403);
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("uses the verified caller, never a submitted user ID", async () => {
    const api = setup("privacy-controls");
    expect(
      (await api.call({ action: "reset_memory", confirm: "reset_memory", userId: "stranger" }))
        .status,
    ).toBe(200);
    expect(api.rpc).toHaveBeenCalledWith("reset_privacy_memory", { _user_id: owner });
  });
  it("keeps deletion off until the worker and secret are configured", async () => {
    const api = setup("privacy-controls", { PRIVACY_DELETION_ENABLED: "true" });
    expect((await api.call({ action: "delete_account", confirm: "delete_account" })).status).toBe(
      503,
    );
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("acknowledges a durable request, not completion, on worker errors", async () => {
    const api = setup("privacy-controls", {
      PRIVACY_DELETION_ENABLED: "true",
      PRIVACY_MAINTENANCE_ENABLED: "true",
      PRIVACY_CRON_SECRET: secret,
    });
    api.erase.mockRejectedValue(new Error("private provider details"));
    const response = await api.call({ action: "delete_account", confirm: "delete_account" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ complete: false, queued: true });
    expect(api.rpc).toHaveBeenCalledWith("request_account_erasure", { _user_id: owner });
    expect(JSON.stringify(api.logger.error.mock.calls)).not.toContain("private provider details");
  });
});

describe("actual scheduler handler", () => {
  it("does not accept user JWTs as scheduler authorization", async () => {
    const api = setup("privacy-maintenance", { PRIVACY_CRON_SECRET: secret });
    expect((await api.call({ execute: true })).status).toBe(401);
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("previews by default and does not erase files or accounts", async () => {
    const api = setup("privacy-maintenance", { PRIVACY_CRON_SECRET: secret });
    expect((await api.call({}, secret)).status).toBe(200);
    expect(api.rpc).toHaveBeenCalledWith("run_privacy_retention", { _execute: false });
    expect(api.erase).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect((await api.call({ execute: true }, secret)).status).toBe(503);
  });
});

describe("actual owner export handler", () => {
  it("includes owner-filtered social and quota rows without reading other profiles", async () => {
    const api = setup("privacy-export");
    const response = await api.call({ userId: "stranger" });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.account.id).toBe(owner);
    expect(result.tables).toHaveProperty("follows");
    expect(result.tables).toHaveProperty("ai_rate_limits");
    expect(api.chain.eq.mock.calls.every(([, id]) => id === owner)).toBe(true);
    expect(
      api.chain.or.mock.calls.every(
        ([filter]) => filter.includes(owner) && !filter.includes("stranger"),
      ),
    ).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses a partial export when any table fails", async () => {
    const api = setup("privacy-export");
    api.chain.range.mockResolvedValueOnce({ data: [], error: new Error("private error") });
    const response = await api.call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private error");
  });
});
