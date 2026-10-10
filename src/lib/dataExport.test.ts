import { describe, expect, it, vi } from "vitest";
import { collectOwnData, EXPORT_TABLES } from "./dataExport";
describe("private data export", () => {
  it("filters every application dataset by the same authenticated owner", async () => {
    const read = vi.fn().mockResolvedValue({ data: [], error: null });
    const data = await collectOwnData("owner", read, () => true);
    expect(Object.keys(data.tables)).toHaveLength(EXPORT_TABLES.length + 1);
    expect(read.mock.calls.every((call) => call[1] === "owner")).toBe(true);
  });
  it("refuses other people's public rows and never returns a partial export on errors", async () => {
    await expect(
      collectOwnData(
        "owner",
        async () => ({ data: [{ id: "stranger" }], error: null }),
        () => true,
      ),
    ).rejects.toThrow("Invalid export owner");
    await expect(
      collectOwnData(
        "owner",
        async () => ({ data: null, error: new Error("denied") }),
        () => true,
      ),
    ).rejects.toThrow("denied");
  });
  it("stops when the active account changes", async () => {
    const read = vi.fn();
    await expect(collectOwnData("owner", read, () => false)).rejects.toThrow("Account changed");
    expect(read).not.toHaveBeenCalled();
  });
});
