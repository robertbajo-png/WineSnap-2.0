import { describe, expect, it } from "vitest";
import {
  assertFreshCluster,
  ciDatabaseTarget,
  localIoFlags,
  sqlInventory,
} from "./database-checks.mjs";

const acknowledgement = { CI: "true", WINESNAP_DATABASE_CHECK: "ephemeral-synthetic-only" };

describe("ephemeral database check boundaries", () => {
  it("disables asynchronous workers only for Windows PG18+ rehearsals", () => {
    expect(localIoFlags("win32", 18)).toEqual(["-c", "io_method=sync"]);
    expect(localIoFlags("win32", 17)).toEqual([]);
    expect(localIoFlags("linux", 18)).toEqual([]);
    expect(localIoFlags("darwin", 18)).toEqual([]);
  });
  it("requires CI mode and explicit acknowledgement before connecting", () => {
    for (const env of [{}, { CI: "true" }, { ...acknowledgement, CI: "false" }]) {
      expect(() => ciDatabaseTarget(env)).toThrow();
    }
  });

  it("never uses inherited database targets or credentials", () => {
    const target = ciDatabaseTarget({
      ...acknowledgement,
      DATABASE_URL: "postgres://private@production.invalid/app",
      PGHOST: "production.invalid",
      PGPORT: "5432",
      PGPASSWORD: "private",
      SUPABASE_URL: "https://production.invalid",
    });
    expect(target.host).toBe("127.0.0.1");
    expect(target.port).toBe(54329);
    expect(target.user).toBe("winesnap_ci");
    expect(target.database).toBe("postgres");
    expect(target.password).not.toBe("private");
    expect(() => ciDatabaseTarget(acknowledgement, ["--database-url", "anything"])).toThrow();
  });

  it("refuses populated clusters, preexisting application roles and tables", () => {
    const empty = { databases: ["postgres", "template0", "template1"], roles: [], tables: [] };
    expect(() => assertFreshCluster(empty)).not.toThrow();
    for (const state of [
      { ...empty, databases: ["postgres", "app"] },
      { ...empty, roles: ["anon"] },
      { ...empty, tables: ["wines"] },
    ]) {
      expect(() => assertFreshCluster(state)).toThrow();
    }
  });

  it("inventories the existing SQL, with unique versions and reproducible hashes", async () => {
    const { migrations, invariants } = await sqlInventory(process.cwd());
    expect(migrations.length).toBeGreaterThanOrEqual(33);
    expect(invariants.length).toBeGreaterThanOrEqual(11);
    expect(migrations.some(({ name }) => name === "20261013180000_privacy_controls.sql")).toBe(
      true,
    );
    for (const file of [...migrations, ...invariants]) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.source.length).toBeGreaterThan(0);
    }
  });
});
