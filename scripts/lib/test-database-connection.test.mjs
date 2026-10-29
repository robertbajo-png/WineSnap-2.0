import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  testDatabaseEndpoints,
  testDatabaseFailure,
  testDatabaseOptions,
  testDatabaseProject,
  testDatabasePurpose,
  validateTestDatabaseInput,
  validateTestRootCertificate,
} from "./test-database-connection.mjs";

const fixture = () => ({
  version: 1,
  project: testDatabaseProject,
  purpose: testDatabasePurpose,
  ...testDatabaseEndpoints.session,
  port: 5432,
  database: "postgres",
  password: "synthetic password:with/@?symbols",
});

describe("WineSnap-test PostgreSQL connection", () => {
  it("accepts only the observed test session endpoint or that test's direct hostname", () => {
    expect(validateTestDatabaseInput(fixture()).project).toBe(testDatabaseProject);
    expect(validateTestDatabaseInput({ ...fixture(), ...testDatabaseEndpoints.direct }).user).toBe(
      "postgres",
    );
  });
  it.each([
    ["project", "mervdrbnwgreaifobasw"],
    ["host", "db.mervdrbnwgreaifobasw.supabase.co"],
    ["host", "db.pzniyupmgwvlldvztzqh.supabase.co.attacker.example"],
    ["host", "127.0.0.1"],
    ["host", "aws-0-eu-west-1.pooler.supabase.com"],
    ["host", "https://aws-1-eu-west-1.pooler.supabase.com"],
    ["user", "postgres.mervdrbnwgreaifobasw"],
    ["user", "postgres"],
    ["port", 6543],
    ["port", "5432"],
    ["database", "other"],
    ["version", 2],
    ["purpose", "production"],
    ["password", ""],
    ["password", null],
    ["password", "secret\nnext"],
    ["password", "secret\0next"],
  ])("rejects unsafe %s before a driver can connect", (key, value) => {
    expect(() => validateTestDatabaseInput({ ...fixture(), [key]: value })).toThrow();
  });
  it("refuses arbitrary URL, TLS, query and password-file configuration", () => {
    for (const extra of [
      { url: "postgresql://other" },
      { ssl: false },
      { query: "DELETE FROM wines" },
      { passwordFile: "C:/private/file" },
      { certificateUrl: "https://attacker.example/ca" },
    ]) {
      expect(() => validateTestDatabaseInput({ ...fixture(), ...extra })).toThrow();
    }
    expect(() => validateTestDatabaseInput({ ...fixture(), password: "a".repeat(4097) })).toThrow();
    expect(() =>
      validateTestDatabaseInput({
        ...fixture(),
        ...testDatabaseEndpoints.direct,
        user: `postgres.${testDatabaseProject}`,
      }),
    ).toThrow();
  });
  it("does not let ambient connection settings redirect a validated target", () => {
    const before = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://production.invalid/other";
      const options = testDatabaseOptions(fixture(), "synthetic-ca-not-used-for-network");
      expect(options.host).toBe(testDatabaseEndpoints.session.host);
      expect(options.username).toBe(`postgres.${testDatabaseProject}`);
      expect(options.port).toBe(5432);
      expect(options.database).toBe("postgres");
      expect(options.ssl.rejectUnauthorized).toBe(true);
      expect(options.ssl.servername).toBe(testDatabaseEndpoints.session.host);
      expect(options.max).toBe(1);
      expect(options.prepare).toBe(false);
      expect(options.debug).toBe(false);
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = before;
    }
  });
  it("rejects a substituted public root certificate", () => {
    expect(() => validateTestRootCertificate(Buffer.from("different certificate"))).toThrow();
    expect(() => validateTestRootCertificate(Buffer.alloc(16385))).toThrow();
  });
  it.each([
    ["28P01", "database_password_rejected"],
    ["42501", "insufficient_backup_permissions"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "certificate_verification_failed"],
    ["ENOTFOUND", "database_dns_unavailable"],
    ["ECONNREFUSED", "database_network_unavailable"],
    ["CONNECT_TIMEOUT", "database_connection_timeout"],
  ])("classifies %s without copying a private error message", (code, expected) => {
    const secret = "postgres://private-password@example.invalid/secret-record";
    expect(testDatabaseFailure({ code, message: secret }, "connection")).toBe(expected);
    expect(testDatabaseFailure({ cause: { code, message: secret } }, "connection")).toBe(expected);
    expect(testDatabaseFailure({ message: secret }, "connection")).toBe(
      "database_connection_not_verified",
    );
  });
  it("uses fixed read-only SQL, private stdin and hidden Windows-encrypted input", () => {
    const helper = readFileSync(
      new URL("../check-test-database-connection.mjs", import.meta.url),
      "utf8",
    );
    expect(helper).toContain('sql.begin("READ ONLY"');
    expect(helper).not.toMatch(
      /\.unsafe\(|\b(?:INSERT INTO|DELETE FROM|ALTER ROLE|CREATE ROLE|UPDATE public)\b/i,
    );
    expect(helper).toContain("validateTestDatabaseInput(JSON.parse");
    expect(helper.indexOf("validateTestDatabaseInput(JSON.parse")).toBeLessThan(
      helper.indexOf("sql = postgres("),
    );
    expect(helper).not.toContain("DATABASE_URL");
    const wrapper = readFileSync(
      new URL("../configure-test-database.ps1", import.meta.url),
      "utf8",
    );
    expect(wrapper).toContain("$field.UseSystemPasswordChar=$true");
    expect(wrapper).toContain("$field.Clear()");
    expect(wrapper).toContain("Export-Clixml -LiteralPath $temporary");
    expect(wrapper).toContain("$acl.SetAccessRuleProtection($true,$false)");
    expect(wrapper).toContain("$start.RedirectStandardInput=$true");
    expect(wrapper).toContain("$start.Environment.Clear()");
    expect(wrapper).not.toMatch(/param\([^\n]*\$Password|SetEnvironmentVariable|Reset-Password/i);
    expect(wrapper).not.toContain("mervdrbnwgreaifobasw");
  });
});
