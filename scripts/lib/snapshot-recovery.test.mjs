import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  snapshotProject,
  snapshotTables,
  validateSnapshot,
  snapshotRestoreSql,
  snapshotTablesFor,
} from "./snapshot-recovery.mjs";

function fixture() {
  const id = "00000000-0000-4000-8000-000000000001";
  const content = Buffer.from("synthetic-image-byte-check");
  return {
    version: 1,
    project: snapshotProject,
    createdAt: "2026-10-24T12:00:00Z",
    tables: Object.fromEntries(snapshotTables.map((name) => [name, []])),
    accounts: [{ id, email: "snapshot@example.test" }],
    files: [
      {
        bucket: "wine-labels",
        path: `${id}/label.png`,
        sha256: createHash("sha256").update(content).digest("hex"),
        base64: content.toString("base64"),
      },
    ],
  };
}
describe("private application snapshot rehearsal", () => {
  it("requires all six Chef sections in v3 and keeps v1/v2 compatible", () => {
    const snapshot = fixture();
    snapshot.version = 3;
    for (const table of snapshotTablesFor(3)) snapshot.tables[table] ??= [];
    expect(validateSnapshot(snapshot)).toBe(snapshot);
    expect(snapshotTablesFor(3)).toHaveLength(30);
    expect(snapshotRestoreSql(snapshot)).toContain("public.food_memory_tombstones");
    delete snapshot.tables.chef_requests;
    expect(() => validateSnapshot(snapshot)).toThrow();
  });
  it("includes all cooking rows in v2 while preserving legacy v1 snapshots", () => {
    const snapshot = fixture();
    snapshot.version = 2;
    for (const table of snapshotTablesFor(2)) snapshot.tables[table] ??= [];
    expect(validateSnapshot(snapshot)).toBe(snapshot);
    expect(snapshotTablesFor(2)).toHaveLength(24);
    expect(snapshotRestoreSql(snapshot)).toContain("public.cooking_feedback");
    delete snapshot.tables.cooking_sessions;
    expect(() => validateSnapshot(snapshot)).toThrow();
  });
  it("accepts the exact versioned table contract and real byte hashes", () => {
    const snapshot = fixture();
    expect(validateSnapshot(snapshot)).toBe(snapshot);
    expect(snapshotTables).toHaveLength(20);
  });
  it.each(["version", "project", "createdAt"])(
    "rejects an invalid %s before starting Docker",
    (key) => {
      const snapshot = fixture();
      snapshot[key] = "invalid";
      expect(() => validateSnapshot(snapshot)).toThrow();
    },
  );
  it("rejects incomplete, invented and malformed table sections", () => {
    for (const mutation of [
      (s) => delete s.tables.wines,
      (s) => (s.tables.injected = []),
      (s) => (s.tables.wines = [null]),
    ]) {
      const snapshot = fixture();
      mutation(snapshot);
      expect(() => validateSnapshot(snapshot)).toThrow();
    }
  });
  it("refuses duplicate accounts or ownerless/misplaced objects", () => {
    for (const mutation of [
      (s) => s.accounts.push(s.accounts[0]),
      (s) => (s.files[0].bucket = "public"),
      (s) => (s.files[0].path = "other-owner/file"),
      (s) => (s.files[0].path = s.accounts[0].id + "/../file"),
      (s) => (s.files[0].path = s.accounts[0].id + "/a\\b"),
      (s) => s.files.push(s.files[0]),
    ]) {
      const snapshot = fixture();
      mutation(snapshot);
      expect(() => validateSnapshot(snapshot)).toThrow();
    }
  });
  it("rejects corrupt base64 or altered images even when decoding succeeds", () => {
    for (const mutation of [
      (s) => (s.files[0].base64 = "!!!"),
      (s) => (s.files[0].sha256 = "0".repeat(64)),
      (s) => (s.files[0].base64 += "="),
    ]) {
      const snapshot = fixture();
      mutation(snapshot);
      expect(() => validateSnapshot(snapshot)).toThrow();
    }
  });
  it("refuses malformed account metadata instead of coercing it into reconstructed users", () => {
    for (const patch of [
      { email: {} },
      { created_at: "not a date" },
      { last_sign_in_at: 12 },
      { user_metadata: [] },
    ]) {
      const snapshot = fixture();
      Object.assign(snapshot.accounts[0], patch);
      expect(() => validateSnapshot(snapshot)).toThrow();
    }
  });
  it("encodes arbitrary row strings as typed JSON data, never executable SQL", () => {
    const snapshot = fixture();
    const malicious = "'); DROP TABLE dangerous; --";
    snapshot.tables.wines = [{ wine_name: malicious }];
    const sql = snapshotRestoreSql(snapshot);
    expect(sql).not.toContain(malicious);
    expect(sql).toContain(Buffer.from(JSON.stringify(snapshot.tables.wines)).toString("hex"));
    expect(sql).toContain("VALIDATE CONSTRAINT");
    expect(sql).toContain("pg_read_binary_file('/tmp/winesnap-image-0')");
    expect(sql).not.toContain("encrypted_password");
  });
});
