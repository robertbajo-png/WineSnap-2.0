import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessPlanningLedger,
  planningLedgerQuery,
  planningMigration,
  planningRollbackTag,
} from "./owned-planning-preflight.mjs";

const installation = "a".repeat(32);
const previous = { name: "20261117000000_previous.sql", source: "SELECT 1;\n" };
const plan = { name: planningMigration, source: "SELECT 2;\n" };
const later = { name: "20261119000000_later.sql", source: "SELECT 3;\n" };
const source = [previous, plan];
const applied = ({ name, source }) => ({
  name,
  sha256: createHash("sha256").update(source).digest("hex"),
});
const before = {
  installation,
  applied: [applied(previous)],
  tableExists: false,
  saveExists: false,
};
const after = {
  ...before,
  applied: source.map(applied),
  tableExists: true,
  saveExists: true,
};

describe("owned planning update preflight", () => {
  it("accepts the intact prefix with exactly the additive week-plan migration pending", () => {
    expect(assessPlanningLedger(source, before, installation)).toEqual({
      applied: 1,
      pending: [planningMigration],
      scope: "expected_additive_migration",
    });
  });
  it("recognizes a consistent previous apply without recommending a replay", () => {
    expect(assessPlanningLedger(source, after, installation)).toEqual({
      applied: 2,
      pending: [],
      scope: "already_applied",
    });
  });
  it.each([
    { ...before, installation: "b".repeat(32) },
    { ...before, applied: [{ ...applied(previous), sha256: "0".repeat(64) }] },
    { ...before, applied: [applied(later)] },
    { ...before, applied: [applied(previous), applied(previous)] },
    { ...before, applied: [applied(plan)], tableExists: true, saveExists: true },
    { ...before, tableExists: true },
    { ...after, saveExists: false },
    { ...after, tableExists: false },
  ])("refuses a wrong identity, drift, or inconsistent schema markers (%#)", (ledger) => {
    expect(() => assessPlanningLedger(source, ledger, installation)).toThrow();
  });
  it("rejects widening the batch to an unrelated migration", () => {
    expect(() => assessPlanningLedger([...source, later], before, installation)).toThrow();
    expect(() => assessPlanningLedger([...source, later], after, installation)).toThrow();
  });
  it("uses a bounded read-only metadata probe, with no reading of plan rows", () => {
    expect(planningLedgerQuery).toContain("REPEATABLE READ READ ONLY");
    expect(planningLedgerQuery).toContain("statement_timeout = '5s'");
    expect(planningLedgerQuery.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(planningLedgerQuery).not.toMatch(/FROM\s+(?:public\.)?kitchen_week_plans/i);
  });
  it("derives a local retention tag from a verified image ID only", () => {
    expect(planningRollbackTag("sha256:" + "a".repeat(64))).toBe(
      "winesnap-owned:planning-rollback-" + "a".repeat(12),
    );
    for (const value of ["winesnap-owned:local", "sha256:" + "A".repeat(64), "a".repeat(64)])
      expect(() => planningRollbackTag(value)).toThrow();
  });
});
