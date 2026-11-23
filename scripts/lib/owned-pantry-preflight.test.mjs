import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planningMigration } from "./owned-planning-preflight.mjs";
import {
  assessPantryLedger,
  pantryLedgerQuery,
  pantryMigrationBatch,
  pantryRollbackTag,
  requirePantryUpdate,
} from "./owned-pantry-preflight.mjs";

const installation = "a".repeat(32);
const source = (name) => ({ name, source: `-- synthetic ${name}\nSELECT 1;` });
const applied = ({ name, source }) => ({
  name,
  sha256: createHash("sha256").update(source).digest("hex"),
});
const base = [
  ...Array.from({ length: 37 }, (_, n) =>
    source("202610010000" + String(n).padStart(2, "0") + "_prior.sql"),
  ),
  source(planningMigration),
];
const sources = [...base, ...pantryMigrationBatch.map(source)];
const markers = [
  "stock",
  "receipt",
  "saveStock",
  "confirmUsage",
  "validateDiners",
  "enforceDiners",
  "dinerTrigger",
];
const markerState = (value) => Object.fromEntries(markers.map((marker) => [marker, value]));
const before = {
  installation,
  applied: base.map(applied),
  tableExists: true,
  saveExists: true,
  ...markerState(false),
};
const after = { ...before, applied: sources.map(applied), ...markerState(true) };

describe("owned DEV-07 update preflight", () => {
  it("requires exactly the hashed 38-to-40 transition regardless of input order", () => {
    expect(requirePantryUpdate([...sources].reverse(), before, installation)).toEqual({
      applied: 38,
      pending: pantryMigrationBatch,
      scope: "expected_additive_migrations",
    });
  });

  it("verifies a fully applied schema but does not authorize replay", () => {
    expect(assessPantryLedger(sources, after, installation)).toEqual({
      applied: 40,
      pending: [],
      scope: "already_applied",
    });
    expect(() => requirePantryUpdate(sources, after, installation)).toThrow("not a retry");
  });

  it.each([
    { ...before, installation: "b".repeat(32) },
    { ...before, applied: before.applied.slice(1) },
    { ...before, applied: sources.slice(0, 39).map(applied) },
    { ...before, applied: sources.slice(2).map(applied) },
    { ...before, applied: [...before.applied.slice(1), before.applied[1]] },
    {
      ...before,
      applied: [{ ...before.applied[0], sha256: "0".repeat(64) }, ...before.applied.slice(1)],
    },
    { ...before, tableExists: false },
    { ...before, saveExists: false },
  ])(
    "refuses identity drift, non-prefix ledger, incomplete changes or missing planner (%#)",
    (ledger) => {
      expect(() => assessPantryLedger(sources, ledger, installation)).toThrow();
    },
  );

  it.each(markers)("rejects marker drift for %s at either side of the update", (marker) => {
    expect(() =>
      assessPantryLedger(sources, { ...before, [marker]: true }, installation),
    ).toThrow();
    expect(() =>
      assessPantryLedger(sources, { ...after, [marker]: false }, installation),
    ).toThrow();
    expect(() =>
      assessPantryLedger(sources, { ...after, [marker]: undefined }, installation),
    ).toThrow();
  });

  it("rejects wider or different candidate batches", () => {
    const unexpected = source("20261123160000_unexpected.sql");
    expect(() => assessPantryLedger([...sources, unexpected], before, installation)).toThrow();
    expect(() =>
      assessPantryLedger([...sources.slice(0, -1), unexpected], before, installation),
    ).toThrow();
  });

  it("bounds the catalog read and requires the diner trigger to be enabled on the right table", () => {
    expect(pantryLedgerQuery).toContain("REPEATABLE READ READ ONLY");
    expect(pantryLedgerQuery).toContain("statement_timeout = '5s'");
    expect(pantryLedgerQuery).toContain("tgrelid=to_regclass('public.kitchen_week_plans')");
    expect(pantryLedgerQuery).toContain("tgenabled='O'");
    expect(pantryLedgerQuery.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(pantryLedgerQuery).not.toMatch(/FROM\s+(?:public\.)?kitchen_/i);
  });

  it("derives the retention tag only from a verified exact image ID", () => {
    expect(pantryRollbackTag("sha256:" + "a".repeat(64))).toBe(
      "winesnap-owned:pantry-rollback-" + "a".repeat(12),
    );
    expect(() => pantryRollbackTag("winesnap-owned:local")).toThrow();
  });
});
