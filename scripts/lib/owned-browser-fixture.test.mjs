import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  assertFixtureOwner,
  fixtureImagePaths,
  ownedBrowserFixture,
  ownedMealSessionId,
  validateBrowserFixture,
} from "./owned-browser-fixture.mjs";
import { scanUploadPath } from "../../src/lib/scanSave.ts";

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

describe("owned completed meal fixture preparation", () => {
  let value, app, original, version, originalQuery, versionQuery;
  const ok = (data) => ({ data, error: null });
  const query = (data) => {
    const result = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue(ok(data)),
    };
    result.select.mockReturnValue(result);
    result.eq.mockReturnValue(result);
    return result;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    value = fixture();
    original = {
      user_id: value.userId,
      recipe_version_id: value.versionId,
      revision: 4,
      state: { status: "running", activeStep: 1, servings: 3, timers: [{ remaining: 30 }] },
    };
    version = {
      id: value.versionId,
      user_id: value.userId,
      document: { servings: 2, steps: [{}, {}, {}] },
    };
    originalQuery = query(original);
    versionQuery = query(version);
    app = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue(
            ok({
              user: {
                id: value.userId,
                email: value.email,
                app_metadata: { owned_browser_run: value.run },
              },
            }),
          ),
        },
        signInWithPassword: vi.fn().mockResolvedValue(ok({ session: {} })),
      },
      from: vi.fn((table) => {
        if (table === "kitchen_recipe_versions") return versionQuery;
        if (table === "cooking_sessions") return originalQuery;
        throw Error("unexpected_table");
      }),
      rpc: vi.fn(async (name, input) => {
        if (name === "meals_access") return ok(true);
        if (name === "kitchen_save_session")
          return ok({
            id: input._id,
            user_id: value.userId,
            recipe_version_id: value.versionId,
            state: input._state,
          });
        throw Error("unexpected_rpc");
      }),
    };
    mocks.createClient.mockReturnValue(app);
  });
  it("derives a stable separate UUID without changing the strict manifest", () => {
    const id = ownedMealSessionId(value);
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(ownedMealSessionId({ ...value })).toBe(id);
    expect(ownedMealSessionId(fixture())).not.toBe(id);
    expect(Object.values(value)).not.toContain(id);
    expect(validateBrowserFixture(value)).toBe(value);
  });
  it("uses one idempotent completed session and never writes the original running session", async () => {
    const before = structuredClone(original);
    const result = await ownedBrowserFixture(keys(), "meals", value);
    expect(result).toEqual({
      completed: true,
      mealSessionId: ownedMealSessionId(value),
      activeSessionUnchanged: true,
    });
    expect(app.rpc.mock.calls).toEqual([
      ["meals_access"],
      [
        "kitchen_save_session",
        {
          _id: result.mealSessionId,
          _request_id: result.mealSessionId,
          _version_id: value.versionId,
          _expected_revision: 0,
          _feedback: null,
          _state: {
            status: "completed",
            activeStep: 2,
            servings: 2,
            checkedIngredientIds: [],
            timers: [],
          },
        },
      ],
    ]);
    expect(originalQuery.single).toHaveBeenCalledTimes(2);
    expect(originalQuery.eq.mock.calls).toEqual([
      ["id", value.sessionId],
      ["user_id", value.userId],
      ["id", value.sessionId],
      ["user_id", value.userId],
    ]);
    expect(versionQuery.eq.mock.calls).toEqual([
      ["id", value.versionId],
      ["user_id", value.userId],
    ]);
    expect(original).toEqual(before);
    app.rpc.mockClear();
    await ownedBrowserFixture(keys(), "meals", value);
    expect(app.rpc.mock.calls[1][1]._request_id).toBe(result.mealSessionId);
  });
  it("never enables the meals gate when the fixture lacks access", async () => {
    app.rpc.mockResolvedValue(ok(false));
    await expect(ownedBrowserFixture(keys(), "meals", value)).rejects.toThrow();
    expect(app.rpc).toHaveBeenCalledExactlyOnceWith("meals_access");
    expect(app.from).not.toHaveBeenCalled();
  });
  it.each(["id", "email", "tag"])(
    "rejects a mismatched immutable fixture identity: %s",
    async (kind) => {
      const user = {
        id: value.userId,
        email: value.email,
        app_metadata: { owned_browser_run: value.run },
      };
      if (kind === "tag") user.app_metadata = {};
      else user[kind] = kind === "email" ? "real@example.com" : randomUUID();
      app.auth.admin.getUserById.mockResolvedValue(ok({ user }));
      await expect(ownedBrowserFixture(keys(), "meals", value)).rejects.toThrow();
      expect(app.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(app.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(["versionOwner", "versionId", "sessionOwner", "sessionVersion", "emptySteps"])(
    "rejects a foreign or invalid source before creating a session: %s",
    async (kind) => {
      if (kind === "versionOwner") version.user_id = randomUUID();
      if (kind === "versionId") version.id = randomUUID();
      if (kind === "sessionOwner") original.user_id = randomUUID();
      if (kind === "sessionVersion") original.recipe_version_id = randomUUID();
      if (kind === "emptySteps") version.document.steps = [];
      await expect(ownedBrowserFixture(keys(), "meals", value)).rejects.toThrow();
      expect(app.rpc).toHaveBeenCalledExactlyOnceWith("meals_access");
    },
  );
  it("does not report success if the original session changes during preparation", async () => {
    originalQuery.single
      .mockResolvedValueOnce(ok(original))
      .mockResolvedValueOnce(ok({ ...original, revision: 5 }));
    await expect(ownedBrowserFixture(keys(), "meals", value)).rejects.toThrow();
    expect(app.rpc.mock.calls[1][1]._id).not.toBe(value.sessionId);
  });
  it("does not accept a malformed committed-session response", async () => {
    app.rpc.mockResolvedValueOnce(ok(true)).mockResolvedValueOnce(ok({ id: value.sessionId }));
    await expect(ownedBrowserFixture(keys(), "meals", value)).rejects.toThrow();
  });
});

describe("owned meal fixture cascade verification", () => {
  let value, admin, from, queries;
  const tables = [
    "kitchen_households",
    "kitchen_household_members",
    "kitchen_household_invites",
    "kitchen_diners",
    "meal_wine_links",
    "cooking_sessions",
  ];
  beforeEach(() => {
    vi.resetAllMocks();
    value = fixture();
    queries = new Map();
    from = vi.fn((table) => {
      const q = {
        select: vi.fn(),
        eq: vi.fn(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      q.select.mockReturnValue(q);
      q.eq.mockReturnValue(q);
      queries.set(table, q);
      return q;
    });
    admin = {
      getUserById: vi
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
        .mockResolvedValue({ data: { user: null }, error: { status: 404 } }),
      deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    };
    mocks.createClient.mockReturnValue({ auth: { admin }, from });
  });
  it("checks only fixed exact-owner tables after the tagged account has been deleted", async () => {
    await expect(
      ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupMeals: true }),
    ).resolves.toMatchObject({ cleanupCompleted: true });
    expect(admin.deleteUser).toHaveBeenCalledExactlyOnceWith(value.userId);
    expect(from.mock.calls.map(([table]) => table)).toEqual(tables);
    for (const q of queries.values()) {
      expect(q.select).toHaveBeenCalledExactlyOnceWith("id");
      expect(q.eq).toHaveBeenCalledExactlyOnceWith("user_id", value.userId);
      expect(q.limit).toHaveBeenCalledExactlyOnceWith(1);
      expect(q.select.mock.invocationCallOrder[0]).toBeGreaterThan(
        admin.getUserById.mock.invocationCallOrder[1],
      );
    }
  });
  it("still checks child rows on an already-deleted fixture without another delete", async () => {
    await ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupMeals: true });
    from.mockClear();
    await expect(
      ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupMeals: true }),
    ).resolves.toMatchObject({ alreadyClean: true });
    expect(admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(6);
  });
  it.each([{ rows: [{ id: randomUUID() }] }, { rows: { length: 0 } }, { rows: null }])(
    "does not treat surviving or malformed child rows as successful cleanup",
    async ({ rows }) => {
      from.mockImplementation(() => {
        const q = {
          select: () => q,
          eq: () => q,
          limit: async () => ({ data: rows, error: null }),
        };
        return q;
      });
      await expect(
        ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupMeals: true }),
      ).rejects.toThrow();
      expect(admin.deleteUser).toHaveBeenCalledExactlyOnceWith(value.userId);
    },
  );
  it("does not query or delete a foreign account", async () => {
    admin.getUserById.mockReset();
    admin.getUserById.mockResolvedValue({
      data: { user: { id: value.userId, email: "real@example.com" } },
      error: null,
    });
    await expect(
      ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupMeals: true }),
    ).rejects.toThrow();
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
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
  it.each(["jpg", "png", "webp"])(
    "keeps stable scan uploads compatible with bounded flat cleanup: %s",
    (extension) => {
      const value = fixture();
      const path = scanUploadPath(
        { id: value.wineId, owner: value.userId, imagePath: null, insertStarted: false },
        extension,
      );
      expect(fixtureImagePaths([path], value)).toEqual([
        `${value.userId}/${value.wineId}.${extension}`,
      ]);
    },
  );
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
  it("refuses foreign image paths before storage or account deletion", async () => {
    const value = fixture(),
      remove = vi.fn(),
      deleteUser = vi.fn();
    const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [{ image_url: randomUUID() + "/other.webp" }],
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
          deleteUser,
        },
      },
      from: vi.fn().mockReturnValue(query),
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    });
    await expect(
      ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupImages: true }),
    ).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("removes an uploaded orphan only below the verified fixture folder before deleting its account", async () => {
    const value = fixture(),
      name = randomUUID() + ".webp";
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
    const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ name, id: randomUUID() }], error: null })
      .mockResolvedValue({ data: [], error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockReturnValue({
      auth: { admin: { getUserById: getUser, deleteUser } },
      from: vi.fn().mockReturnValue(query),
      storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    });
    expect(
      (await ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupImages: true }))
        .cleanupCompleted,
    ).toBe(true);
    expect(list).toHaveBeenNthCalledWith(1, value.userId, { limit: 101, offset: 0 });
    expect(remove).toHaveBeenCalledExactlyOnceWith([value.userId + "/" + name]);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });
  it.each([
    [{ name: "nested", id: null }],
    [{ name: "../other.webp", id: "file" }],
    Array.from({ length: 101 }, () => ({ name: "image.webp", id: "file" })),
  ])("refuses folders, traversal or an oversized fixture image inventory", async (...objects) => {
    const value = fixture(),
      deleteUser = vi.fn(),
      remove = vi.fn();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
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
          deleteUser,
        },
      },
      from: vi.fn().mockReturnValue(query),
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: objects, error: null }),
          remove,
        }),
      },
    });
    await expect(
      ownedBrowserFixture(keys(), "cleanup", value, undefined, { cleanupImages: true }),
    ).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
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
