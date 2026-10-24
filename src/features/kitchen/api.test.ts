import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: mock.getUser }, rpc: mock.rpc },
}));
import { verifyKitchenOwner } from "./api";
const owner = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockResolvedValue({ data: true, error: null });
});
describe("cooking authorization and offline failure distinction", () => {
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
