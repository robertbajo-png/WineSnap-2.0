import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, view, legacy } = vi.hoisted(() => {
  const query = () => ({ select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() });
  return { from: vi.fn(), view: query(), legacy: query() };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { loadPublicWine } from "./publicWine";

describe("public wine sharing reads", () => {
  beforeEach(() => {
    from.mockReset().mockImplementation((name) => (name === "public_wines" ? view : legacy));
    for (const query of [view, legacy]) {
      query.select.mockReset().mockReturnValue(query);
      query.eq.mockReset().mockReturnValue(query);
      query.maybeSingle.mockReset();
    }
  });

  it("uses the public projection without exposing owner or collector fields", async () => {
    view.maybeSingle.mockResolvedValue({ data: { id: "synthetic" }, error: null });
    expect((await loadPublicWine("synthetic-share")).data?.id).toBe("synthetic");
    expect(from).toHaveBeenCalledExactlyOnceWith("public_wines");
    expect(view.eq).toHaveBeenCalledExactlyOnceWith("share_id", "synthetic-share");
    const columns = view.select.mock.calls[0][0].split(",");
    for (const column of ["user_id", "rating", "notes", "purchase_price", "is_public"]) {
      expect(columns).not.toContain(column);
    }
  });

  it("does not query the base table when a private or revoked share is absent", async () => {
    view.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadPublicWine("revoked-share")).toEqual({ data: null, error: null });
    expect(from).toHaveBeenCalledExactlyOnceWith("public_wines");
  });

  it("only supports a missing-view source installation with an explicit public filter", async () => {
    for (const code of ["PGRST205", "42P01"]) {
      from.mockClear();
      legacy.eq.mockClear();
      view.maybeSingle.mockResolvedValue({
        data: null,
        error: { code, message: "public.public_wines does not exist" },
      });
      legacy.maybeSingle.mockResolvedValue({ data: { id: "legacy-public" }, error: null });
      expect((await loadPublicWine("old-share")).data?.id).toBe("legacy-public");
      expect(from.mock.calls.map(([table]) => table)).toEqual(["public_wines", "wines"]);
      expect(legacy.eq.mock.calls).toEqual([
        ["share_id", "old-share"],
        ["is_public", true],
      ]);
    }
  });

  it("does not bypass view denial, schema errors, network errors or another missing relation", async () => {
    for (const error of [
      { code: "42501", message: "permission denied" },
      { code: "42703", message: "missing column" },
      { code: "fetch_error", message: "network unavailable" },
      { code: "42P01", message: "another relation does not exist" },
    ]) {
      from.mockClear();
      view.maybeSingle.mockResolvedValue({ data: null, error });
      expect((await loadPublicWine("synthetic-share")).error).toBe(error);
      expect(from).toHaveBeenCalledExactlyOnceWith("public_wines");
    }
  });
});
