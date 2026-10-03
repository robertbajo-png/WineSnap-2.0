import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    from: () => ({
      select: () => {
        const query = {
          eq: () => query,
          is: () => query,
          limit: () => query,
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
            mocks.lookup().then(resolve, reject),
        };
        return query;
      },
      insert: mocks.insert,
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({ logEvent: vi.fn() }));
import { addToWishlist } from "./wishlist";

describe("wishlist suggestion saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.lookup.mockResolvedValue({ data: [], error: null });
    mocks.single.mockResolvedValue({ data: { id: "new-entry" }, error: null });
    mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  });

  it("does not insert an already saved suggestion", async () => {
    mocks.lookup.mockResolvedValue({ data: [{ id: "existing" }], error: null });
    expect(await addToWishlist({ producer: "Maker", wine_name: "Wine", vintage: "NV" })).toBe(
      false,
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("shares concurrent work and records only one new save", async () => {
    const wine = { producer: "Maker", wine_name: "Wine", vintage: 2023 };
    expect(await Promise.all([addToWishlist(wine), addToWishlist(wine)])).toEqual([true, false]);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("does not insert when the duplicate check fails", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect(await addToWishlist({ wine_name: "Wine" })).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not save without a user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await addToWishlist({ wine_name: "Wine" })).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
