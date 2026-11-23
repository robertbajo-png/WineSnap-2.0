import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planningMigration } from "./owned-planning-preflight.mjs";
import {
  assessPantryLedger,
  guardOwnedPantryBatch,
  pantryLedgerQuery,
  pantryMigrationBatch,
  pantryMigrationTransaction,
  pantryRollbackTag,
  requirePantryPaused,
  requirePantryRecovery,
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
const archive = "owned-20261123-190000000.dpapi";
const now = Date.parse("2026-11-23T20:00:00Z");
function observedRecovery() {
  const common = {
    project: "winesnap-owned-local",
    checkedAt: "2026-11-23T19:00:01Z",
    completed: true,
    productionTouched: false,
    hostedTestTouched: false,
  };
  return {
    archives: { application: [archive] },
    reports: {
      "ingress-control": { ...common, enabled: true },
      "tunnel-control": { ...common, enabled: false },
      backup: {
        ...common,
        backupFile: archive,
        encryptedRoundtripVerified: true,
        backupIncludesAuthHashes: true,
        backupIncludesImageBytes: true,
      },
      restore: {
        ...common,
        checkedAt: "2026-11-23T19:04:09Z",
        backupFile: archive,
        archiveVersion: 2,
        cleanupCompleted: true,
        isolatedOwnedRestoreVerified: true,
        runningInstallationStopped: false,
        sourceDatabaseConnected: false,
        providerCredentialsLoaded: false,
        publicPorts: 0,
        permanentVolumesCreated: 0,
        originalUserPasswordsEnteredOrReset: false,
        authHashesAndIdentitiesMatched: true,
        grantsPoliciesAndFunctionsMatched: true,
        allTableRowsAndShareIdsMatched: true,
        syntheticCloneLoginAndWrongPassword: true,
        restoredOwnerIsolationWithRealJwt: true,
        tablesVerified: 82,
        storageFilesVerified: 1,
        restoredObjectsDownloaded: 1,
      },
    },
  };
}

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

  it("requires both exact checksummed scripts in order and writes both ledger entries atomically", () => {
    const batch = sources.slice(-2).map((item) => ({ ...item, ...applied(item) }));
    const sql = pantryMigrationTransaction(batch);
    expect(sql.match(/^BEGIN;$/gm)).toEqual(["BEGIN;"]);
    expect(sql.match(/^COMMIT;$/gm)).toEqual(["COMMIT;"]);
    expect(sql.match(/INSERT INTO winesnap_local\.migrations/g)).toHaveLength(2);
    expect(sql.indexOf(batch[0].source)).toBeLessThan(sql.indexOf(batch[1].source));
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(() => pantryMigrationTransaction(batch.slice(1))).toThrow();
    expect(() => pantryMigrationTransaction([...batch].reverse())).toThrow();
    expect(() =>
      pantryMigrationTransaction([{ ...batch[0], source: "SELECT 2;" }, batch[1]]),
    ).toThrow();
  });

  it("requires a fresh exact encrypted archive and a later successful isolated restore", () => {
    const input = observedRecovery();
    expect(() => requirePantryRecovery(input, archive, now)).not.toThrow();
    expect(() => requirePantryRecovery(input, "owned-20261123-171500000.dpapi", now)).toThrow();
    expect(() => requirePantryRecovery(input, archive, now + 3_601_000)).toThrow("Fresh");
    input.reports.restore.checkedAt = "2026-11-23T19:00:00Z";
    expect(() => requirePantryRecovery(input, archive, now)).toThrow("ordered");
    input.reports.restore.checkedAt = "2026-11-23T20:01:00Z";
    expect(() => requirePantryRecovery(input, archive, now)).toThrow("non-future");
    input.reports.restore.cleanupCompleted = false;
    expect(() => requirePantryRecovery(input, archive, now)).toThrow("must be current");
  });

  it("fails unless both the private status and live connector state show the public tunnel paused", () => {
    const input = observedRecovery();
    expect(() => requirePantryPaused(input, "", now)).not.toThrow();
    expect(() => requirePantryPaused(input, "winesnap-owned-tunnel", now)).toThrow();
    input.reports["tunnel-control"].enabled = true;
    expect(() => requirePantryPaused(input, "", now)).toThrow();
    delete input.reports["tunnel-control"];
    expect(() => requirePantryPaused(input, "", now)).toThrow();
  });

  it("stops ordinary updates of an existing installation without blocking new provisioning", () => {
    const pending = sources.slice(-2);
    expect(() => guardOwnedPantryBatch(pending, 38, false)).toThrow("dedicated DEV-07");
    expect(() => guardOwnedPantryBatch(pending.slice(1), 39, false)).toThrow();
    expect(() => guardOwnedPantryBatch(pending, 0, false)).not.toThrow();
    expect(() => guardOwnedPantryBatch([], 40, false)).not.toThrow();
    expect(() => guardOwnedPantryBatch(pending, 38, true)).not.toThrow();
  });

  it("places the exact update and archive requirements before migrations and web replacement", () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
    const wrapper = read("../run-owned-windows.ps1");
    const node = read("../manage-owned-backend.mjs");
    expect(wrapper).toMatch(
      /\$RequirePantryMigration -and \(\$Action -ne 'Update'[\s\S]+?-not \$VerifiedPantryBackup\)/,
    );
    expect(wrapper.indexOf("Open-OwnedRuntimeLock -Name operation")).toBeLessThan(
      wrapper.indexOf("WINESNAP_OWNED_PANTRY_BACKUP"),
    );
    expect(node).toMatch(
      /phase = "pantry_update_guard";[\s\S]+?pantryDeliveryChecks\(previousPantryImage\);[\s\S]+?requirePantryUpdate\([\s\S]+?phase = "owned_networks_and_volumes";/,
    );
    expect(node).toMatch(
      /phase = "application_migrations";[\s\S]+?guardOwnedPantryBatch\([\s\S]+?requirePantryUpdate\(sources, ledger, keys.installationId\);[\s\S]+?pantryMigrationTransaction\(pending\)/,
    );
    expect(node).toMatch(
      /report\.pantryRestSchemaVerified = true;[\s\S]+?VITE_PANTRY_ENABLED: pantryEnabled \? "true" : "false"[\s\S]+?phase = "pantry_pre_replacement_guard";[\s\S]+?pantryDeliveryChecks\(previousPantryImage\);[\s\S]+?\["rm", "--force", name\("web"\)\]/,
    );
  });
});
