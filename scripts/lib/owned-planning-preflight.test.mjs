import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessPlanningLedger,
  planningLedgerQuery,
  planningMigration,
  planningRollbackTag,
  requirePlanningUpdate,
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

  it("requires precisely the existing 37-to-38 transition and refuses a retry", () => {
    const prior = [
      ...Array.from({ length: 36 }, (_, n) => ({
        name: "202610010000" + String(n).padStart(2, "0") + "_prior.sql",
        source: "SELECT 1;",
      })),
      previous,
    ];
    const actualSource = [...prior, plan];
    const ready = { ...before, applied: prior.map(applied) };
    expect(requirePlanningUpdate(actualSource, ready, installation)).toMatchObject({
      applied: 37,
      pending: [planningMigration],
    });
    expect(() => requirePlanningUpdate(source, before, installation)).toThrow("baseline");
    expect(() =>
      requirePlanningUpdate(
        actualSource,
        {
          ...after,
          applied: actualSource.map(applied),
        },
        installation,
      ),
    ).toThrow("not a retry");
    expect(() => requirePlanningUpdate([...actualSource, later], ready, installation)).toThrow();
    expect(() =>
      requirePlanningUpdate(actualSource, { ...ready, saveExists: true }, installation),
    ).toThrow();
  });

  it("keeps the optional guard locked, ahead of service changes, and repeats it before SQL", () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
    const wrapper = read("../run-owned-windows.ps1");
    expect(wrapper).toContain(
      "if($RequirePlanningMigration -and ($Action -ne 'Update' -or $PublicOrigin -or $LocalOnly -or $PilotUi))",
    );
    expect(wrapper.indexOf("Open-OwnedRuntimeLock -Name operation")).toBeLessThan(
      wrapper.indexOf("WINESNAP_OWNED_REQUIRE_PLANNING_MIGRATION"),
    );
    const backend = read("../manage-owned-backend.mjs");
    expect(backend).toMatch(
      /phase = "planning_update_guard";[\s\S]+?planningRollbackTag\(priorImage\)[\s\S]+?requirePlanningUpdate\([\s\S]+?phase = "owned_networks_and_volumes";/,
    );
    expect(backend).toMatch(
      /phase = "application_migrations";[\s\S]+?requirePlanningUpdate\(sources, ledger, keys.installationId\);[\s\S]+?for \(const item of pending\)/,
    );
  });

  it("refreshes only after applied migrations and verifies the new table is private before web replacement", () => {
    const backend = readFileSync(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(backend).toMatch(
      /phase = "gateway";[\s\S]+?if \(pending\.length\) \{\s+phase = "rest_schema_reload";[\s\S]+?NOTIFY pgrst, 'reload schema';[\s\S]+?request\("\/rest\/v1\/kitchen_week_plans\?limit=0"\);[\s\S]+?assert\.equal\(result\.code, "42501"\);[\s\S]+?phase = "web_build";/,
    );
  });
});
