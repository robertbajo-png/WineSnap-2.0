import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askChef, changeFoodMemory } from "./api";
import { emptyChefContext } from "./domain";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session } },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
vi.mock("./feature", () => ({ chefEnabled: true }));
const owner = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: owner }, access_token: "synthetic-owner-token" } },
  });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.create.mockReturnValue({ rpc: mocks.rpc });
  vi.stubGlobal("fetch", mocks.send);
});
afterEach(() => vi.unstubAllGlobals());
describe("Chef account fencing", () => {
  it("rejects stale actions after an account switch before any network write", async () => {
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: "different-owner" }, access_token: "other" } },
    });
    await expect(
      changeFoodMemory(owner, "add", crypto.randomUUID(), 0, {
        attribute: "ingredient",
        value: "tomat",
        direction: 1,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      askChef(
        {
          action: "chat",
          requestId: crypto.randomUUID(),
          context: emptyChefContext,
          message: "Hello",
          conversationId: crypto.randomUUID(),
          conversationRevision: 0,
        },
        owner,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("pins memory mutations to the captured owner token rather than a later global session", async () => {
    await changeFoodMemory(owner, "add", crypto.randomUUID(), 0, {
      attribute: "ingredient",
      value: "tomat",
      direction: 1,
    });
    expect(await mocks.create.mock.calls[0][2].accessToken()).toBe("synthetic-owner-token");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "food_memory_change",
      expect.objectContaining({ _action: "add" }),
    );
  });
});
