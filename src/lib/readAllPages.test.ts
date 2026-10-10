import { describe, expect, it, vi } from "vitest";
import { readAllPages } from "./readAllPages";
describe("complete paginated reads", () => {
  it("continues past the API row cap", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3], error: null });
    expect(await readAllPages(read, undefined, 2)).toEqual([1, 2, 3]);
    expect(read).toHaveBeenNthCalledWith(2, 2, 3);
  });
  it("never disguises a later page failure as a complete collection", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("offline") });
    await expect(readAllPages(read, undefined, 2)).rejects.toThrow("offline");
  });
  it("does not continue reading a signed-out user's pages", async () => {
    const read = vi.fn();
    expect(await readAllPages(read, () => true)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
