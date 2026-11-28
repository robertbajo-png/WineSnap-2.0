import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  assessOwnedMealPhotoLedger,
  deliverOwnedMealPhotoUpdate,
  mealPhotoFallbackLabel,
  mealPhotoMigrationBatch,
  mealPhotoWebLabel,
  ownedInstallationFingerprint,
  ownedMealPhotoLedgerQuery,
  ownedMealPhotoMigrationTransaction,
  refuseOrdinaryMealPhotoMigration,
  requireMealPhotoRecovery,
  requireOwnedMealPhotoUpdate,
} from "./owned-meal-photo-delivery.mjs";
import { planOwnedMigrations } from "./owned-lifecycle.mjs";

const base = new URL("../../supabase/migrations/", import.meta.url);
const sources = await Promise.all(
  (await readdir(base))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map(async (name) => ({ name, source: await readFile(new URL(name, base), "utf8") })),
);
const installation = "a".repeat(32);
const exact = planOwnedMigrations(sources, []);
const pending = exact.slice(40);
const state = (installed = false) => ({
  installation,
  applied: exact.slice(0, installed ? 42 : 40).map(({ name, sha256 }) => ({ name, sha256 })),
  baseline: true,
  mealTable: installed,
  rls: installed,
  bucket: installed,
  directStorageDenied: installed,
  digestColumn: installed,
  saveFunction: installed,
  objectTransition: installed,
  ownerReadGranted: installed,
  ownerSaveGranted: installed,
  serviceTransitionGranted: installed,
  publicBucket: false,
  anonymousReadGranted: false,
  directWriteGranted: false,
  anonymousSaveGranted: false,
  clientTransitionGranted: false,
});

const previousImage = "sha256:" + "1".repeat(64);
const candidateImage = "sha256:" + "2".repeat(64);
const archive = "owned-20261128-120000000.dpapi";
const now = Date.parse("2026-11-28T13:00:00Z");
const archiveSha256 = "3".repeat(64);

function recoveryEvidence() {
  const common = {
    project: "winesnap-owned-local",
    checkedAt: "2026-11-28T12:00:01Z",
    completed: true,
    productionTouched: false,
    hostedTestTouched: false,
  };
  const binding = {
    backupFile: archive,
    backupArchiveSha256: archiveSha256,
    backupInstallationFingerprint: ownedInstallationFingerprint(installation),
  };
  return {
    archives: { application: [archive] },
    reports: {
      "ingress-control": { ...common, enabled: true },
      "tunnel-control": { ...common, enabled: false },
      backup: {
        ...common,
        ...binding,
        backupWebImage: previousImage,
        encryptedRoundtripVerified: true,
        backupIncludesAuthHashes: true,
        backupIncludesImageBytes: true,
      },
      restore: {
        ...common,
        ...binding,
        checkedAt: "2026-11-28T12:04:09Z",
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

describe("meal-photo pre-update recovery evidence", () => {
  const binding = { archiveSha256, installation, previousImage };

  it("requires the same fresh encrypted bytes, installation and previous image", () => {
    expect(() => requireMealPhotoRecovery(recoveryEvidence(), archive, binding, now)).not.toThrow();
    expect(() =>
      requireMealPhotoRecovery(recoveryEvidence(), archive, binding, now + 2 * 3600000),
    ).toThrow();
    expect(() =>
      requireMealPhotoRecovery(
        recoveryEvidence(),
        archive,
        { ...binding, previousImage: candidateImage },
        now,
      ),
    ).toThrow("different web image");
    expect(() =>
      requireMealPhotoRecovery(
        recoveryEvidence(),
        archive,
        { ...binding, archiveSha256: "4".repeat(64) },
        now,
      ),
    ).toThrow("digest changed");
  });

  it.each(["backup", "restore"])("rejects missing or foreign evidence in %s", (report) => {
    const observation = recoveryEvidence();
    delete observation.reports[report].backupArchiveSha256;
    expect(() => requireMealPhotoRecovery(observation, archive, binding, now)).toThrow(
      "digest changed",
    );
    observation.reports[report].backupArchiveSha256 = archiveSha256;
    observation.reports[report].backupInstallationFingerprint = ownedInstallationFingerprint(
      "b".repeat(32),
    );
    expect(() => requireMealPhotoRecovery(observation, archive, binding, now)).toThrow(
      "another installation",
    );
  });
});

function maintenanceFixture() {
  const previous = { Id: "b".repeat(64), Image: previousImage, State: { Running: true } };
  let web = previous;
  let installed = false;
  const currentState = () => assessOwnedMealPhotoLedger(sources, state(installed), installation);
  const steps = [];
  const adapters = {
    previous,
    guard: vi.fn(async ({ retained }) => {
      steps.push(retained ? "guard-retained" : "guard");
      return currentState();
    }),
    build: vi.fn(async () => {
      steps.push("build");
      return candidateImage;
    }),
    retain: vi.fn(async () => steps.push("retain")),
    apply: vi.fn(async () => {
      steps.push("apply");
      installed = true;
    }),
    assess: vi.fn(async () => currentState()),
    verifyBackend: vi.fn(async () => steps.push("verify-backend")),
    readWeb: async () => web,
    removeWeb: vi.fn(async (id) => {
      expect(id).toBe(web.Id);
      web = null;
      steps.push("remove");
    }),
    startWeb: vi.fn(async (Image, label) => {
      web = { Id: "c".repeat(64), Image, Config: { Labels: { "winesnap.meal-photo": label } } };
      steps.push(label);
    }),
    verifyWeb: vi.fn(async () => steps.push("verify-web")),
    tagWeb: vi.fn(async () => steps.push("tag")),
    stage: vi.fn(),
    recovery: vi.fn(),
  };
  return { adapters, steps, currentState, substituteWeb: (replacement) => (web = replacement) };
}

describe("meal-photo maintenance and restricted fallback", () => {
  it("does not build or mutate if preflight rejects, or apply if the post-retain gate fails", async () => {
    const { adapters } = maintenanceFixture();
    adapters.guard.mockRejectedValueOnce(new Error("restore proof missing"));
    await expect(deliverOwnedMealPhotoUpdate(adapters)).rejects.toThrow("restore proof missing");
    expect(adapters.build).not.toHaveBeenCalled();
    expect(adapters.retain).not.toHaveBeenCalled();
    adapters.guard.mockImplementation(async ({ retained }) => {
      if (retained) throw new Error("tunnel active");
      return requireOwnedMealPhotoUpdate(sources, state(), installation);
    });
    await expect(deliverOwnedMealPhotoUpdate(adapters)).rejects.toThrow("tunnel active");
    expect(adapters.apply).not.toHaveBeenCalled();
    expect(adapters.removeWeb).not.toHaveBeenCalled();
  });

  it("retains the previous image before DDL and tags only a verified upgrade", async () => {
    const { adapters, steps, currentState } = maintenanceFixture();
    await expect(deliverOwnedMealPhotoUpdate(adapters)).resolves.toBe(candidateImage);
    expect(steps).toEqual([
      "guard",
      "build",
      "guard",
      "retain",
      "guard-retained",
      "apply",
      "verify-backend",
      "remove",
      mealPhotoWebLabel,
      "verify-web",
      "verify-backend",
      "tag",
    ]);
    expect(adapters.retain).toHaveBeenCalledWith(previousImage);
    expect(adapters.apply).toHaveBeenCalledWith(ownedMealPhotoMigrationTransaction(pending));
    expect(adapters.tagWeb).toHaveBeenCalledWith(candidateImage);
    expect(adapters.recovery).not.toHaveBeenCalled();
    expect(currentState().applied).toBe(42);
  });

  it("leaves the existing container untouched if the transaction is not committed", async () => {
    const { adapters, currentState } = maintenanceFixture();
    adapters.apply.mockRejectedValueOnce(new Error("transaction failed"));
    await expect(deliverOwnedMealPhotoUpdate(adapters)).rejects.toThrow("transaction failed");
    expect(adapters.recovery).toHaveBeenCalledWith("schema_unchanged");
    expect(adapters.removeWeb).not.toHaveBeenCalled();
    expect(adapters.startWeb).not.toHaveBeenCalled();
    expect(adapters.tagWeb).not.toHaveBeenCalled();
    expect(currentState().applied).toBe(40);
  });

  it("keeps committed DDL and restores only a restricted previous web if verification fails", async () => {
    const { adapters, currentState } = maintenanceFixture();
    adapters.verifyWeb.mockRejectedValueOnce(new Error("candidate is unhealthy"));
    await expect(deliverOwnedMealPhotoUpdate(adapters)).rejects.toThrow("candidate is unhealthy");
    expect(adapters.startWeb.mock.calls).toEqual([
      [candidateImage, mealPhotoWebLabel],
      [previousImage, mealPhotoFallbackLabel],
    ]);
    expect(adapters.tagWeb.mock.calls).toEqual([[previousImage]]);
    expect(adapters.recovery).toHaveBeenLastCalledWith("restricted_fallback_verified");
    expect(currentState().applied).toBe(42);
  });

  it("does not remove an unexpected replacement during failure recovery", async () => {
    const { adapters, substituteWeb } = maintenanceFixture();
    adapters.verifyWeb.mockImplementationOnce(async () => {
      substituteWeb({ Id: "d".repeat(64), Image: candidateImage, Config: { Labels: {} } });
      throw new Error("unexpected replacement");
    });
    await expect(deliverOwnedMealPhotoUpdate(adapters)).rejects.toThrow("refuse removal");
    expect(adapters.removeWeb.mock.calls).toEqual([[adapters.previous.Id]]);
    expect(adapters.tagWeb).not.toHaveBeenCalled();
  });
});

describe("guarded owned meal-photo migrations", () => {
  it("accepts only the owned, unchanged 40-to-42 migration progression", () => {
    expect(requireOwnedMealPhotoUpdate(sources, state(), installation)).toEqual({
      applied: 40,
      pending,
      scope: "expected_additive_migrations",
    });
    expect(assessOwnedMealPhotoLedger(sources, state(true), installation)).toEqual({
      applied: 42,
      pending: [],
      scope: "already_applied",
    });
    expect(() => requireOwnedMealPhotoUpdate(sources, state(true), installation)).toThrow(
      "not a retry",
    );
    expect(() => requireOwnedMealPhotoUpdate(sources, state(), "b".repeat(32))).toThrow();
  });

  it("rejects extra, reordered, partial, modified or falsely installed migrations", () => {
    const partial = state();
    partial.applied.push({ name: pending[0].name, sha256: pending[0].sha256 });
    expect(() => requireOwnedMealPhotoUpdate(sources, partial, installation)).toThrow("Partial");
    const driftedLedger = state();
    driftedLedger.applied[0].sha256 = "0".repeat(64);
    expect(() => requireOwnedMealPhotoUpdate(sources, driftedLedger, installation)).toThrow(
      "changed",
    );
    const driftedSource = sources.map((file) =>
      file.name === mealPhotoMigrationBatch[1] ? { ...file, source: file.source + "\n" } : file,
    );
    expect(() => requireOwnedMealPhotoUpdate(driftedSource, state(), installation)).toThrow(
      "source changed",
    );
    expect(() =>
      requireOwnedMealPhotoUpdate(
        [...sources, { name: "20261129000000_extra.sql", source: "" }],
        state(),
        installation,
      ),
    ).toThrow();
    expect(() =>
      assessOwnedMealPhotoLedger(sources, { ...state(), bucket: true }, installation),
    ).toThrow("schema marker");
    expect(() => ownedMealPhotoMigrationTransaction([...pending].reverse())).toThrow("Unexpected");
  });

  it.each([
    "publicBucket",
    "anonymousReadGranted",
    "directWriteGranted",
    "clientTransitionGranted",
  ])("refuses an upgraded catalog with %s", (marker) => {
    expect(() =>
      assessOwnedMealPhotoLedger(sources, { ...state(true), [marker]: true }, installation),
    ).toThrow("Unsafe DEV-10 schema marker");
  });

  it("keeps the two real DDL files and ledger writes in a single outer transaction", () => {
    const sql = ownedMealPhotoMigrationTransaction(pending);
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql.indexOf("CREATE TABLE public.kitchen_photo_meals")).toBeLessThan(
      sql.indexOf("INSERT INTO winesnap_local.migrations"),
    );
    expect(sql.lastIndexOf("INSERT INTO winesnap_local.migrations")).toBeLessThan(
      sql.lastIndexOf("COMMIT;"),
    );
    expect(sql).toContain(pending[0].sha256);
    expect(sql).toContain(pending[1].sha256);
    expect(ownedMealPhotoLedgerQuery).toContain("READ ONLY");
    expect(ownedMealPhotoLedgerQuery).not.toMatch(
      /FROM public\.kitchen_photo_meals|FROM storage\.objects/,
    );
  });

  it("rejects any reserved file on the ordinary update path", () => {
    expect(() => refuseOrdinaryMealPhotoMigration(pending.slice(1))).toThrow("dedicated");
    expect(() => refuseOrdinaryMealPhotoMigration(exact.slice(0, 40))).not.toThrow();
  });

  it("refuses the ordinary update before network/service setup and again before DDL", async () => {
    const manager = await readFile(new URL("../manage-owned-backend.mjs", import.meta.url), "utf8");
    expect(manager).toMatch(
      /phase = "refuse_unguarded_schema_update";[\s\S]*?refuseOrdinaryMealPhotoMigration\(\[\.\.\.pending, \.\.\.ledger\.applied\]\);[\s\S]*?phase = "owned_networks_and_volumes";/,
    );
    expect(manager).toMatch(
      /phase = "application_migrations";[\s\S]*?refuseOrdinaryMealPhotoMigration\(pending\);[\s\S]*?for \(const item of pending\)/,
    );
  });
});
