import { describe, expect, it } from "vitest";
import { clientBudgets, clientBudgetIssues } from "./client-budgets.mjs";

describe("compressed client asset budgets", () => {
  const baseline = () => [
    { name: "entry.js", gzipBytes: clientBudgets[".js"] },
    { name: "style.css", gzipBytes: clientBudgets[".css"] },
  ];
  it("accepts the exact budget and separately split route assets", () => {
    expect(clientBudgetIssues([...baseline(), { name: "scan.js", gzipBytes: 10000 }])).toEqual([]);
  });
  it("rejects a regression in either JavaScript or CSS", () => {
    expect(
      clientBudgetIssues(baseline().map((asset) => ({ ...asset, gzipBytes: asset.gzipBytes + 1 }))),
    ).toEqual(["oversize:entry.js", "oversize:style.css"]);
  });
  it("does not pass an empty or partially missing build", () => {
    expect(clientBudgetIssues([])).toEqual(["missing:.js", "missing:.css"]);
    expect(clientBudgetIssues(baseline().slice(0, 1))).toEqual(["missing:.css"]);
  });
  it.each([0, -1, NaN, Infinity, 0.5])("rejects invalid sizes: %s", (gzipBytes) => {
    expect(clientBudgetIssues([{ name: "entry.js", gzipBytes }, baseline()[1]])).toContain(
      "invalid:entry.js",
    );
  });
});
