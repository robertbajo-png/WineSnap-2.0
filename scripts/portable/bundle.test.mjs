import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Encrypter } from "age-encryption";
import { binaryPart } from "../lib/platform-recovery.mjs";
import { ownedServices } from "../lib/owned-backend.mjs";
import { approvedTunnelAccount, approvedTunnelId } from "../lib/owned-tunnel.mjs";
import { validatePortableBundle, sealPortable, openPortable } from "./bundle.mjs";

const project = "winesnap-owned-local",
  hex = "a".repeat(64);
const password = Buffer.from("synthetic-only-recovery-phrase-not-a-real-secret");
function fixture() {
  const relations = [
    ["auth", "users"],
    ["auth", "identities"],
    ["public", "wines"],
    ["storage", "objects"],
    ["winesnap_local", "installation"],
  ].map(([schema, table]) => ({ schema, table, rows: 0, sha256: hex }));
  const data = Buffer.from("SQLite format 3\0synthetic");
  return {
    version: 1,
    project,
    format: "winesnap-portable-age-v1",
    createdAt: "2026-11-01T16:00:00Z",
    providersIncluded: false,
    source: {
      applicationBackup: "owned-20261101-150000000.dpapi",
      gateBackup: "gate-20261101-150000000.dpapi",
      toolCommit: "b".repeat(40),
    },
    application: {
      version: 2,
      project,
      writeQuiesced: true,
      createdAt: "2026-11-01T15:00:00Z",
      configuration: {
        version: 1,
        project,
        installationId: "c".repeat(32),
        issuedAt: 1700000000,
        dbPassword: hex,
        jwtSecret: hex,
        cronSecret: hex,
        privacyCronSecret: hex,
      },
      database: binaryPart(Buffer.from("PGDMPsynthetic")),
      roles: binaryPart(Buffer.from("CREATE ROLE postgres;\n")),
      storage: binaryPart(Buffer.from("synthetic tar")),
      images: Object.fromEntries(Object.keys(ownedServices).map((name) => [name, `sha256:${hex}`])),
      manifest: {
        database: {
          algorithm: "owned-logical-v1",
          relations,
          catalog: Object.fromEntries(
            [
              "tables",
              "columns",
              "policies",
              "grants",
              "views",
              "sequences",
              "functions",
              "schemas",
              "schema_grants",
              "roles",
              "memberships",
            ].map((name) => [name, hex]),
          ),
        },
        files: [],
      },
    },
    gate: {
      version: 1,
      project,
      installationId: "c".repeat(32),
      format: "owned-private-gate-sqlite-v1",
      createdAt: "2026-11-01T15:00:00Z",
      files: [
        {
          name: "gate.sqlite3",
          base64: data.toString("base64"),
          sha256: createHash("sha256").update(data).digest("hex"),
        },
      ],
      manifest: [{ name: "synthetic", rows: 0 }],
    },
    credentials: {
      gate: {
        version: 1,
        project,
        hostname: "winesnap.boleoai.se",
        username: "robert",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$c3ludGhldGlj$c3ludGhldGlj",
        sessionSecret: hex,
        storageKey: hex,
        resetSecret: hex,
      },
      tunnel: {
        version: 1,
        project,
        hostname: "winesnap.boleoai.se",
        accountId: approvedTunnelAccount,
        tunnelId: approvedTunnelId,
        token: Buffer.from(
          JSON.stringify({ a: approvedTunnelAccount, t: approvedTunnelId, s: "d".repeat(64) }),
        ).toString("base64"),
      },
    },
    imageReferences: Object.fromEntries(
      Object.entries(ownedServices).map(([name, tag]) => [
        name,
        `${tag.split(":")[0]}@sha256:${hex}`,
      ]),
    ),
  };
}
let ciphertext;
beforeAll(async () => {
  ciphertext = await sealPortable(fixture(), password);
}, 60000);
describe("portable age archives", () => {
  it("uses the standard age file header and restores all content with only the passphrase", async () => {
    expect(ciphertext.subarray(0, 22).toString()).toBe("age-encryption.org/v1\n");
    expect(ciphertext.includes(Buffer.from("synthetic-only"))).toBe(false);
    expect(await openPortable(ciphertext, password)).toEqual(fixture());
  }, 60000);
  it("uses fresh randomized encryption for every backup", async () => {
    expect(await sealPortable(fixture(), password)).not.toEqual(ciphertext);
  }, 60000);
  it("rejects a wrong phrase without returning decrypted data or library diagnostics", async () => {
    await expect(
      openPortable(ciphertext, Buffer.from("wrong-synthetic-only-recovery-phrase")),
    ).rejects.toThrow(/^portable_archive_not_accepted$/);
  }, 60000);
  it("rejects damaged or truncated ciphertext", async () => {
    const damaged = Buffer.from(ciphertext);
    damaged[damaged.length - 1] ^= 1;
    await expect(openPortable(damaged, password)).rejects.toThrow(
      /^portable_archive_not_accepted$/,
    );
    await expect(openPortable(ciphertext.subarray(0, 100), password)).rejects.toThrow(
      /^portable_archive_not_accepted$/,
    );
  }, 60000);
  it("rejects unsupported work factors before attempting expensive key derivation", async () => {
    const e = new Encrypter();
    e.setScryptWorkFactor(21);
    e.setPassphrase(password.toString());
    // Mutate the header instead of actually deriving a 2^21 key.
    const header = Buffer.from(ciphertext.toString("binary").replace(/ 18\n/, " 21\n"), "binary");
    await expect(openPortable(header, password)).rejects.toThrow(/^portable_archive_not_accepted$/);
  });
  it.each([
    Buffer.from("short"),
    Buffer.alloc(513, 65),
    Buffer.from("twenty-plus-chars-but\nnewline"),
    Buffer.from([255, ...Buffer.alloc(30, 65)]),
  ])("rejects unsafe passphrases", async (value) => {
    await expect(sealPortable(fixture(), value)).rejects.toThrow(/^portable_encryption_failed$/);
  });
  it.each([
    (v) => {
      v.project = "production";
    },
    (v) => {
      v.providersIncluded = true;
    },
    (v) => {
      v.application.configuration.openai = "sk-synthetic-test-only-do-not-use";
    },
    (v) => {
      v.gate.installationId = "f".repeat(32);
    },
    (v) => {
      v.gate.gateStore = "machine-bound-dpapi-data";
    },
    (v) => {
      v.credentials.tunnel.hostname = "other.example";
    },
    (v) => {
      v.credentials.gate.username = "not-the-owner";
    },
    (v) => {
      v.imageReferences.db = `untrusted.example/postgres@sha256:${hex}`;
    },
    (v) => {
      v.source.applicationBackup = "../private";
    },
    (v) => {
      v.gate.files[0].sha256 = "f".repeat(64);
    },
    (v) => {
      v.gate.files[0].name = "../../private";
    },
    (v) => {
      v.gate.manifest[0].rows = -1;
    },
    (v) => {
      v.application.manifest.files = [{ path: "../outside", bytes: 1, sha256: hex }];
    },
    (v) => {
      v.application.writeQuiesced = false;
    },
  ])(
    "rejects mixed installations, extra secrets, malformed payloads and untrusted recovery images",
    (change) => {
      const value = fixture();
      change(value);
      expect(() => validatePortableBundle(value)).toThrow();
    },
  );
  it("keeps actual recovery away from the original Windows keys, active database and network routes", () => {
    const source = readFileSync(new URL("./worker.mjs", import.meta.url), "utf8");
    expect(source).toContain('action === "Create"');
    expect(source).toContain('WINESNAP_OWNED_RESTORE_PIPE: "1"');
    expect(source).toMatch(/"--network",\s*"none"/);
    expect(source).not.toMatch(/ProtectedData|\.dpapi["']|fetch\(|https?:\/\/.*supabase/);
    const wrapper = readFileSync(new URL("../run-owned-portable.ps1", import.meta.url), "utf8");
    expect(wrapper).toContain("UseSystemPasswordChar=$true");
    expect(wrapper).toContain("Read-SnapshotStore $payload.gate.gateStore");
    expect(wrapper).toContain("recoveredFilesEncryptedForCurrentUser");
    expect(wrapper).toContain("$start.Environment.Clear()");
    expect(wrapper).not.toMatch(/Read-Host|ConvertFrom-SecureString|ai-keys\.clixml/);
  });
});
