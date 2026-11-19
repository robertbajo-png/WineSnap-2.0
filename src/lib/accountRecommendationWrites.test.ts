import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  root: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  lookup: vi.fn(),
  toast: vi.fn(),
  event: vi.fn(),
}));
vi.mock("./accountWriteScope", () => ({ accountWriteClient: mocks.capture }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.root, auth: { getUser: mocks.root } },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toast, info: mocks.toast, error: mocks.toast },
}));
vi.mock("./analytics", () => ({ logEvent: mocks.event }));
import { recordRecommendationEvent } from "./recommendationEvents";
import { addToWishlist } from "./wishlist";
let current: boolean;
const scope = { owner: "owner-a", current: () => current };
const client = {
  from: () => ({
    delete: () => {
      const q = { eq: () => q, in: mocks.remove };
      return q;
    },
    select: () => {
      const q = {
        eq: () => q,
        is: () => q,
        limit: () => q,
        then: (resolve: (result: unknown) => unknown) => mocks.lookup().then(resolve),
      };
      return q;
    },
    insert: mocks.insert,
  }),
};
beforeEach(() => {
  vi.resetAllMocks();
  current = true;
  mocks.capture.mockResolvedValue(client);
  mocks.remove.mockResolvedValue({ error: null });
  mocks.lookup.mockResolvedValue({ data: [], error: null });
});
describe("recommendation actions remain on their original account", () => {
  it("records feedback through the captured client only", async () => {
    mocks.insert.mockResolvedValue({ error: null });
    expect(
      await recordRecommendationEvent(
        "like",
        "similar",
        { wine_name: "Synthetic" },
        { reference_wine_id: "wine-a" },
        scope,
      ),
    ).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner-a" }));
    expect(mocks.root).not.toHaveBeenCalled();
  });
  it("stops between replacement and insert when the view changes", async () => {
    mocks.remove.mockImplementation(async () => {
      current = false;
      return { error: null };
    });
    expect(
      await recordRecommendationEvent("like", "similar", { wine_name: "Synthetic" }, {}, scope),
    ).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.root).not.toHaveBeenCalled();
  });
  it("stops a wishlist write after a stale lookup, without a new-account toast", async () => {
    mocks.lookup.mockImplementation(async () => {
      current = false;
      return { data: [], error: null };
    });
    expect(await addToWishlist({ wine_name: "Synthetic" }, scope)).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("does not report an old wishlist write as a new-account success", async () => {
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => {
          current = false;
          return { data: { id: "saved" }, error: null };
        },
      }),
    });
    expect(await addToWishlist({ wine_name: "Synthetic" }, scope)).toBe(false);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner-a" }));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.root).not.toHaveBeenCalled();
  });
});
