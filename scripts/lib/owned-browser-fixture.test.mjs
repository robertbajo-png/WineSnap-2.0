import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  assertFixtureOwner,
  ownedBrowserFixture,
  validateBrowserFixture,
} from "./owned-browser-fixture.mjs";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
const keys = () => ({
  version: 1,
  project: "winesnap-owned-local",
  installationId: "a".repeat(32),
  issuedAt: 1792915200,
  dbPassword: "b".repeat(64),
  jwtSecret: "c".repeat(64),
  cronSecret: "d".repeat(64),
  privacyCronSecret: "e".repeat(64),
});

const fixture = () => {
  const run = randomUUID();
  return {
    project: "winesnap-owned-local",
    run,
    email: `owned-browser-${run}@example.test`,
    ...Object.fromEntries(
      ["userId", "wineId", "noteId", "shareId", "versionId", "sessionId"].map((k) => [
        k,
        randomUUID(),
      ]),
    ),
  };
};
describe("owned browser fixtures", () => {
  beforeEach(() => vi.resetAllMocks());
  it("accepts only an exact synthetic fixture manifest", () => {
    const value = fixture();
    expect(validateBrowserFixture(value)).toBe(value);
    expect(() => validateBrowserFixture({ ...value, email: "real@example.com" })).toThrow();
    expect(() => validateBrowserFixture({ ...value, project: "foreign" })).toThrow();
    expect(() => validateBrowserFixture({ ...value, token: "not-allowed" })).toThrow();
    expect(() => validateBrowserFixture({ ...value, userId: "../other" })).toThrow();
  });
  it("requires all three owner identifiers before cleanup or sign-in", () => {
    const value = fixture(),
      user = {
        id: value.userId,
        email: value.email,
        app_metadata: { owned_browser_run: value.run },
      };
    expect(() => assertFixtureOwner(user, value)).not.toThrow();
    expect(() => assertFixtureOwner({ ...user, id: randomUUID() }, value)).toThrow();
    expect(() => assertFixtureOwner({ ...user, email: "real@example.com" }, value)).toThrow();
    expect(() => assertFixtureOwner({ ...user, app_metadata: {} }, value)).toThrow();
    expect(() =>
      assertFixtureOwner(
        { ...user, app_metadata: {}, user_metadata: { owned_browser_run: value.run } },
        value,
      ),
    ).toThrow();
  });
  it("rejects foreign root credentials before making requests", async () => {
    await expect(ownedBrowserFixture({ project: "other" }, "prepare")).rejects.toThrow();
  });
  it("never automates the browser or persists synthetic credentials", () => {
    const source = readFileSync(new URL("./owned-browser-fixture.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(
      /\.supabase\.co|playwright|chromium|writeFile|localStorage|console\./,
    );
    expect(source).toContain("shouldCreateUser: false");
    expect(source).toContain(
      "new URL(url instanceof Request ? url.url : String(url)).origin, ownedApi",
    );
    expect(source).toContain("assertFixtureOwner(ok(found).user, fixture)");
    expect(source).toContain("assertFixtureOwner(user, fixture)");
  });
  it("records cleanup identifiers before setup and keeps them separate from status reports", () => {
    const source = readFileSync(new URL("./owned-browser-fixture.mjs", import.meta.url), "utf8");
    const manager = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(source.indexOf("await remember(validateBrowserFixture(fixture))")).toBeLessThan(
      source.indexOf("await owner();"),
    );
    expect(manager).toContain('"browser-fixture.json"');
    expect(manager).not.toContain('"browserprepare-status.json"');
    expect(manager).toContain('ownedBrowserFixture(keys, "absent", fixture)');
    expect(manager).toContain("!info.isSymbolicLink()");
  });
  it("does not delete an existing fixture when prepare checks whether it is absent", async () => {
    const value = fixture();
    const remove = vi.fn();
    mocks.createClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi
            .fn()
            .mockResolvedValue({ data: { user: { id: value.userId } }, error: null }),
          deleteUser: remove,
        },
      },
    });
    await expect(ownedBrowserFixture(keys(), "absent", value)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
  });
  it("refuses cleanup for user-editable metadata, a wrong email or a wrong ID", async () => {
    const value = fixture();
    for (const user of [
      { id: value.userId, email: value.email, user_metadata: { owned_browser_run: value.run } },
      {
        id: value.userId,
        email: "real@example.com",
        app_metadata: { owned_browser_run: value.run },
      },
      { id: randomUUID(), email: value.email, app_metadata: { owned_browser_run: value.run } },
    ]) {
      const remove = vi.fn();
      mocks.createClient.mockReturnValue({
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({ data: { user }, error: null }),
            deleteUser: remove,
          },
        },
      });
      await expect(ownedBrowserFixture(keys(), "cleanup", value)).rejects.toThrow();
      expect(remove).not.toHaveBeenCalled();
    }
  });
  it("checks deletion and is safely repeatable after the fixture is gone", async () => {
    const value = fixture(),
      remove = vi.fn().mockResolvedValue({ data: {}, error: null });
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          user: {
            id: value.userId,
            email: value.email,
            app_metadata: { owned_browser_run: value.run },
          },
        },
        error: null,
      })
      .mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    mocks.createClient.mockReturnValue({
      auth: { admin: { getUserById: getUser, deleteUser: remove } },
    });
    expect((await ownedBrowserFixture(keys(), "cleanup", value)).cleanupCompleted).toBe(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith(value.userId);
    expect((await ownedBrowserFixture(keys(), "cleanup", value)).alreadyClean).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("cleans the exact newly created account if saving the manifest fails", async () => {
    let user;
    const remove = vi.fn().mockResolvedValue({ data: {}, error: null });
    const signIn = vi.fn();
    mocks.createClient.mockReturnValue({
      auth: {
        signInWithPassword: signIn,
        admin: {
          createUser: vi.fn(async (input) => {
            user = { ...input, id: randomUUID() };
            return { data: { user }, error: null };
          }),
          getUserById: vi.fn(async () => ({ data: { user }, error: null })),
          deleteUser: remove,
        },
      },
    });
    await expect(
      ownedBrowserFixture(keys(), "prepare", undefined, async () => {
        throw new Error("disk unavailable");
      }),
    ).rejects.toThrow("owned_browser_prepare_failed");
    expect(signIn).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledExactlyOnceWith(user.id);
  });
  it("creates a remote conflict only for the exact owned synthetic recipe and revision", async () => {
    const value = fixture();
    const state = {
      status: "running",
      activeStep: 1,
      servings: 3,
      timers: [],
      checkedIngredientIds: [],
    };
    const row = { state, revision: 4, user_id: value.userId, recipe_version_id: value.versionId };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = vi.fn().mockResolvedValue({
      data: { ...row, state: { ...state, activeStep: 0 }, revision: 5 },
      error: null,
    });
    mocks.createClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: value.userId,
                email: value.email,
                app_metadata: { owned_browser_run: value.run },
              },
            },
            error: null,
          }),
        },
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: { access_token: "synthetic-only" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(query),
      rpc,
    });
    const result = await ownedBrowserFixture(keys(), "conflict", value);
    expect(result).toMatchObject({ step: 0, revision: 5, servings: 3 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "kitchen_save_session",
      expect.objectContaining({
        _id: value.sessionId,
        _version_id: value.versionId,
        _expected_revision: 4,
        _state: { ...state, activeStep: 0 },
        _feedback: null,
      }),
    );
    for (const changed of [{ user_id: randomUUID() }, { recipe_version_id: randomUUID() }]) {
      rpc.mockClear();
      query.single.mockResolvedValue({ data: { ...row, ...changed }, error: null });
      await expect(ownedBrowserFixture(keys(), "conflict", value)).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    }
  });
});
