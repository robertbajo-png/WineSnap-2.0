import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  scoped: vi.fn(),
  writeRpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mock.getUser, getSession: mock.getSession },
    rpc: mock.rpc,
    from: mock.from,
  },
}));
vi.mock("@/lib/scopedClient", () => ({ scopedClient: mock.scoped }));
import { verifyKitchenOwner, recipeVersion, archiveRecipe } from "./api";
import { startingRecipes } from "./catalog";
const owner = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.scoped.mockReturnValue({ rpc: mock.writeRpc });
  mock.writeRpc.mockResolvedValue({ data: true, error: null });
});
describe("cooking authorization and offline failure distinction", () => {
  it("keeps mutations on the verified captured token after a global account change", async () => {
    mock.getSession.mockResolvedValue({
      data: { session: { user: { id: owner }, access_token: "synthetic-owner-token" } },
    });
    mock.getUser.mockImplementation(async () => {
      mock.getSession.mockResolvedValue({
        data: { session: { user: { id: "peer" }, access_token: "peer-token" } },
      });
      return { data: { user: { id: owner } }, error: null };
    });
    await archiveRecipe(owner, owner, 1);
    expect(mock.getUser).toHaveBeenCalledWith("synthetic-owner-token");
    expect(mock.scoped).toHaveBeenCalledWith("synthetic-owner-token");
    expect(mock.writeRpc).toHaveBeenCalledWith("kitchen_access");
    expect(mock.writeRpc).toHaveBeenCalledWith("kitchen_archive_recipe", {
      _id: owner,
      _expected_revision: 1,
    });
    expect(mock.rpc).not.toHaveBeenCalled();
    await expect(archiveRecipe(owner, owner, 1)).rejects.toMatchObject({ kind: "unavailable" });
    expect(mock.scoped).toHaveBeenCalledTimes(1);
  });
  it("loads only the exact authorized historical version, without replacing it", async () => {
    const id = "00000000-0000-4000-8000-000000000003";
    const version = {
      id,
      user_id: owner,
      recipe_id: owner,
      revision: 1,
      document: startingRecipes[0],
      created_at: "2026-11-06T10:00:00Z",
    };
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: version, error: null });
    mock.from.mockReturnValue(query);
    mock.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    expect(await recipeVersion(owner, id)).toEqual(version);
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await recipeVersion(owner, id)).toBeNull();
    query.maybeSingle.mockResolvedValue({ data: { ...version, user_id: id }, error: null });
    await expect(recipeVersion(owner, id)).rejects.toMatchObject({ kind: "unavailable" });
  });
  it.each([0, 500, 503, undefined])(
    "keeps a network/auth service failure %s distinct from denied access",
    async (status) => {
      mock.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
      await expect(verifyKitchenOwner(owner)).rejects.toMatchObject({ kind: "network" });
      expect(mock.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403])("fails closed on an explicit authentication denial %s", async (status) => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
    await expect(verifyKitchenOwner(owner)).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("does not authorize a different account", async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: crypto.randomUUID() } }, error: null });
    await expect(verifyKitchenOwner(owner)).rejects.toMatchObject({ kind: "unavailable" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires the server-side cooking and account-state gate on every verification", async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    await verifyKitchenOwner(owner);
    expect(mock.rpc).toHaveBeenCalledWith("kitchen_access");
    mock.rpc.mockResolvedValue({ data: false, error: null });
    await expect(verifyKitchenOwner(owner)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
