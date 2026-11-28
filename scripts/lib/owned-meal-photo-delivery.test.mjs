import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assessOwnedMealPhotoLedger,
  mealPhotoMigrationBatch,
  ownedMealPhotoLedgerQuery,
  ownedMealPhotoMigrationTransaction,
  refuseOrdinaryMealPhotoMigration,
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
