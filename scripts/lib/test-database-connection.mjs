import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";

export const testDatabaseProject = "pzniyupmgwvlldvztzqh";
export const testDatabasePurpose = "WineSnap-test-postgres";
// Observed in this project's Connect panel, not inferred from production.
export const testDatabaseEndpoints = {
  session: { host: "aws-1-eu-west-1.pooler.supabase.com", user: `postgres.${testDatabaseProject}` },
  direct: { host: `db.${testDatabaseProject}.supabase.co`, user: "postgres" },
};
export const testDatabaseRootUrl =
  "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";
export const testDatabaseRootHash =
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";

export function validateTestDatabaseInput(input) {
  assert.ok(input && typeof input === "object" && !Array.isArray(input));
  assert.deepEqual(
    Object.keys(input).sort(),
    ["version", "project", "purpose", "host", "port", "user", "database", "password"].sort(),
  );
  assert.equal(input.version, 1);
  assert.equal(input.project, testDatabaseProject);
  assert.equal(input.purpose, testDatabasePurpose);
  assert.equal(input.database, "postgres");
  assert.equal(input.port, 5432);
  assert.ok(
    Object.values(testDatabaseEndpoints).some(
      (endpoint) => input.host === endpoint.host && input.user === endpoint.user,
    ),
  );
  assert.equal(typeof input.password, "string");
  assert.ok(
    input.password.length > 0 && input.password.length <= 4096 && !/[\0\r\n]/.test(input.password),
  );
  return input;
}

export function validateTestRootCertificate(bytes, now = Date.now()) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 16384);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), testDatabaseRootHash);
  const certificate = new X509Certificate(bytes);
  assert.equal(certificate.ca, true);
  assert.ok(Date.parse(certificate.validFrom) <= now && Date.parse(certificate.validTo) > now);
  return bytes.toString("ascii");
}

export async function loadTestRootCertificate() {
  const response = await fetch(testDatabaseRootUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  return validateTestRootCertificate(bytes);
}

export function testDatabaseOptions(input, certificate) {
  validateTestDatabaseInput(input);
  return {
    host: input.host,
    port: 5432,
    username: input.user,
    password: input.password,
    database: "postgres",
    ssl: {
      rejectUnauthorized: true,
      servername: input.host,
      ca: [...rootCertificates, certificate],
    },
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    connection: { application_name: "winesnap-test-backup-readonly" },
    onnotice: () => {},
    debug: false,
  };
}

export function testDatabaseFailure(error, phase) {
  const code = error?.code ?? error?.cause?.code;
  if (["28P01", "28000"].includes(code)) return "database_password_rejected";
  if (code === "42501") return "insufficient_backup_permissions";
  if (
    [
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    ].includes(code)
  )
    return "certificate_verification_failed";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "database_dns_unavailable";
  if (["ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET"].includes(code))
    return "database_network_unavailable";
  if (["ETIMEDOUT", "CONNECT_TIMEOUT", "57014"].includes(code))
    return "database_connection_timeout";
  return phase === "input" ? "test_target_or_input_rejected" : "database_connection_not_verified";
}
