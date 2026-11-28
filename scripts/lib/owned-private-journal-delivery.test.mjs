import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ownedInstallationFingerprint } from "./owned-meal-photo-delivery.mjs";
import {
  assessJournalCatalog,
  deliverDormantJournal,
  journalDeliveryLabel,
  journalInstallationTransaction,
  journalLabelKey,
  journalPriorWebImage,
  requireJournalRecovery,
} from "./owned-private-journal-delivery.mjs";
import { ownedWebBuildFlags } from "./owned-web-build.mjs";

const installation = "1".repeat(32);
const archive = "owned-20261128-120000000.dpapi";
const archiveSha256 = "2".repeat(64);
const now = Date.parse("2026-11-28T13:00:00Z");
const binding = { archiveSha256, installation, previousImage: journalPriorWebImage };
function evidence() {
  const common = {
    project: "winesnap-owned-local",
    checkedAt: "2026-11-28T12:01:00Z",
    completed: true,
    productionTouched: false,
    hostedTestTouched: false,
    backupFile: archive,
    backupArchiveSha256: archiveSha256,
    backupInstallationFingerprint: ownedInstallationFingerprint(installation),
  };
  return {
    archives: { application: [archive] },
    reports: {
      backup: {
        ...common,
        backupWebImage: journalPriorWebImage,
        encryptedRoundtripVerified: true,
        backupIncludesAuthHashes: true,
        backupIncludesImageBytes: true,
        backupIncludesPrivateJournal: false,
      },
      restore: {
        ...common,
        checkedAt: "2026-11-28T12:04:00Z",
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
        ordinaryJournalExclusionVerified: true,
      },
    },
  };
}

describe("dormant journal delivery safety", () => {
  it("pins the exact previous web image and requires current restore and journal exclusion evidence", () => {
    expect(() => requireJournalRecovery(evidence(), archive, binding, now)).not.toThrow();
    expect(() =>
      requireJournalRecovery(
        evidence(),
        archive,
        { ...binding, previousImage: "sha256:" + "3".repeat(64) },
        now,
      ),
    ).toThrow("Unrehearsed");
    expect(() =>
      requireJournalRecovery(
        evidence(),
        archive,
        { ...binding, archiveSha256: "4".repeat(64) },
        now,
      ),
    ).toThrow("digest changed");
    expect(() => requireJournalRecovery(evidence(), archive, binding, now + 2 * 3600000)).toThrow();
    const changed = evidence();
    changed.reports.restore.ordinaryJournalExclusionVerified = false;
    expect(() => requireJournalRecovery(changed, archive, binding, now)).toThrow();
    changed.reports.restore.ordinaryJournalExclusionVerified = true;
    changed.reports.backup.backupIncludesPrivateJournal = true;
    expect(() => requireJournalRecovery(changed, archive, binding, now)).toThrow();
  });

  it("does not silently adopt a manually created or partially removed schema", () => {
    const absent = { schemas: 0, roleExists: false, bridgeExists: false, triggerCount: 0 };
    expect(assessJournalCatalog(absent)).toBe("absent");
    for (const partial of [{ roleExists: true }, { triggerCount: 1 }, { schemas: 1 }])
      expect(() => assessJournalCatalog({ ...absent, ...partial })).toThrow();
    expect(() => assessJournalCatalog({ ...absent, schemas: 2 })).toThrow("Unreviewed");
  });

  it("pins the SQL bytes, preserves the migration ledger and makes the browser flag non-overridable", async () => {
    const source = await readFile(
      new URL("../../config/owned-windows/dev11.sql", import.meta.url),
      "utf8",
    );
    const ledger = Array.from({ length: 42 }, (_, i) => ({
      name: "fixture_" + i,
      sha256: "d".repeat(64),
    }));
    const transaction = journalInstallationTransaction(source, installation, ledger);
    expect(transaction).toContain("LOCK TABLE winesnap_local.migrations IN SHARE MODE;");
    expect(transaction).toContain("CREATE ROLE winesnap_dev11_api NOLOGIN");
    expect(transaction).not.toMatch(
      /INSERT INTO (?:winesnap_local\.migrations|winesnap_dev11_control\.installation)/,
    );
    expect(() =>
      journalInstallationTransaction(source + "-- change", installation, ledger),
    ).toThrow("source changed");
    expect(() => journalInstallationTransaction(source, installation, ledger.slice(1))).toThrow();
    expect(
      ownedWebBuildFlags({ originBuild: { VITE_PRIVATE_JOURNAL_ENABLED: "true" } })
        .VITE_PRIVATE_JOURNAL_ENABLED,
    ).toBe("false");
  });

  it("stops before installation if the state changed while compiling", async () => {
    const previous = {
      Id: "1".repeat(64),
      Image: journalPriorWebImage,
      State: { Running: true },
      Config: { Labels: {} },
    };
    const apply = vi.fn(),
      retain = vi.fn();
    const guard = vi
      .fn()
      .mockResolvedValueOnce({ schema: "absent" })
      .mockResolvedValueOnce({ schema: "dormant" });
    await expect(
      deliverDormantJournal({
        previous,
        guard,
        build: async () => "sha256:" + "3".repeat(64),
        retain,
        apply,
        readWeb: async () => previous,
        stage: vi.fn(),
      }),
    ).rejects.toThrow("changed during build");
    expect(apply).not.toHaveBeenCalled();
    expect(retain).not.toHaveBeenCalled();
  });

  it("never removes a foreign web container during a failed replacement", async () => {
    const previous = {
      Id: "1".repeat(64),
      Image: journalPriorWebImage,
      State: { Running: true },
      Config: { Labels: {} },
    };
    const removeWeb = vi.fn(),
      tagWeb = vi.fn();
    let web = previous;
    await expect(
      deliverDormantJournal({
        previous,
        guard: async () => ({ schema: "dormant" }),
        build: async () => "sha256:" + "3".repeat(64),
        retain: vi.fn(),
        apply: vi.fn(),
        assess: async () => ({ schema: "dormant" }),
        verifyBackend: vi.fn(),
        readWeb: async () => web,
        removeWeb,
        tagWeb,
        stage: vi.fn(),
        async startWeb(_, label) {
          expect(label).toBe(journalDeliveryLabel);
          web = {
            ...previous,
            Id: "2".repeat(64),
            Image: "sha256:" + "4".repeat(64),
            Config: { Labels: { [journalLabelKey]: journalDeliveryLabel } },
          };
          throw new Error("test failure");
        },
      }),
    ).rejects.toThrow("Unexpected web container");
    expect(removeWeb.mock.calls).toEqual([[previous.Id]]);
    expect(tagWeb).not.toHaveBeenCalled();
  });
});
