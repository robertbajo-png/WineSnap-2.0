import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertSandbox,
  binaryPart,
  checkBinaryPart,
  recoveryImages,
  recoveryNames,
  recoveryProject,
  recoveryScope,
  recoveryToken,
  validatePlatformBundle,
} from "./platform-recovery.mjs";

const id = "1234567890abcdef";
const names = recoveryNames(id);
const owner = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const fixture = () => ({
  version: 1,
  kind: "winesnap-local-platform-fixture",
  project: recoveryProject,
  hostedTestExport: false,
  createdAt: "2026-10-25T10:00:00Z",
  jwtSecret: "a".repeat(64),
  dbPassword: "b".repeat(64),
  catalogHash: "f".repeat(64),
  erasureReceipts: [{ user_id: owner, requested_at: "2026-10-25T10:01:00Z" }],
  images: Object.fromEntries(
    Object.keys(recoveryImages).map((key) => [key, `sha256:${"c".repeat(64)}`]),
  ),
  database: binaryPart(Buffer.from("PGDMPsynthetic-contract-only")),
  roles: binaryPart(Buffer.from("CREATE ROLE anon;")),
  accounts: [
    { id: owner, email: "recovery-owner@example.test", password: "d".repeat(64) },
    { id: peer, email: "recovery-peer@example.test", password: "e".repeat(64) },
  ],
  wineId: owner,
  shareId: `recovery+legacy/${id}`,
  files: [
    {
      bucket: "wine-labels",
      path: `${owner}/recovery.png`,
      type: "image/png",
      ...binaryPart(Buffer.from("synthetic bytes")),
    },
  ],
});
const container = () => ({
  Config: { Labels: { "winesnap.scope": recoveryScope }, User: "1000:1000" },
  HostConfig: {
    NetworkMode: names.network,
    ReadonlyRootfs: true,
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"],
    PortBindings: {},
  },
  Mounts: [],
  NetworkSettings: { Networks: { [names.network]: {} } },
});

describe("local platform recovery boundaries", () => {
  it("roundtrips the bounded synthetic envelope without claiming a hosted export", () => {
    expect(validatePlatformBundle(fixture()).hostedTestExport).toBe(false);
    expect(checkBinaryPart(binaryPart(Buffer.from([0, 1, 2, 255])))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });
  it.each(["production", "mervdrbnwgreaifobasw", "", "1234/../", "a".repeat(17)])(
    "rejects unsafe invocation %s",
    (value) => {
      expect(() => recoveryNames(value)).toThrow();
    },
  );
  it.each([
    ["version", 2],
    ["project", "mervdrbnwgreaifobasw"],
    ["kind", "hosted-backup"],
    ["hostedTestExport", true],
    ["createdAt", "invalid"],
    ["jwtSecret", "secret"],
    ["dbPassword", "password"],
  ])("refuses incompatible envelope %s", (key, value) => {
    const bundle = fixture();
    bundle[key] = value;
    expect(() => validatePlatformBundle(bundle)).toThrow();
  });
  it("refuses archive corruption and noncanonical or unbounded bytes", () => {
    const bundle = fixture();
    bundle.database.base64 = Buffer.from("not a dump").toString("base64");
    expect(() => validatePlatformBundle(bundle)).toThrow();
    expect(() => checkBinaryPart({ base64: "YQ", sha256: "0".repeat(64) })).toThrow();
    expect(() => checkBinaryPart(binaryPart(Buffer.from("too large")), 2)).toThrow();
    expect(() => checkBinaryPart(binaryPart(Buffer.alloc(0)))).toThrow();
  });
  it("refuses unpinned image references", () => {
    const bundle = fixture();
    bundle.images.auth = "supabase/gotrue:latest";
    expect(() => validatePlatformBundle(bundle)).toThrow();
    delete bundle.images.auth;
    expect(() => validatePlatformBundle(bundle)).toThrow();
  });
  it("refuses a replaced archive even with a recomputed content hash", () => {
    const bundle = fixture();
    bundle.database = binaryPart(Buffer.from("not a PostgreSQL archive"));
    expect(() => validatePlatformBundle(bundle)).toThrow();
  });
  it("requires an owner-bound independent newer erasure receipt", () => {
    const bundle = fixture();
    bundle.erasureReceipts[0].user_id = peer;
    expect(() => validatePlatformBundle(bundle)).toThrow();
    bundle.erasureReceipts[0].user_id = owner;
    bundle.erasureReceipts[0].requested_at = "invalid";
    expect(() => validatePlatformBundle(bundle)).toThrow();
    bundle.erasureReceipts = [];
    expect(() => validatePlatformBundle(bundle)).toThrow();
  });
  it("accepts only distinct synthetic accounts and the exact owner image", () => {
    const bundle = fixture();
    bundle.accounts[1].id = owner;
    expect(() => validatePlatformBundle(bundle)).toThrow();
    bundle.accounts[1].id = peer;
    bundle.accounts[1].email = "somebody@real.example";
    expect(() => validatePlatformBundle(bundle)).toThrow();
    const redirected = fixture();
    redirected.files[0].path = `${owner}/../escape.png`;
    expect(() => validatePlatformBundle(redirected)).toThrow();
  });
  it("checks all isolation properties", () => {
    expect(() => assertSandbox(container(), names)).not.toThrow();
    for (const mutate of [
      (c) => {
        c.Config.User = "root";
      },
      (c) => {
        c.Config.User = "0:1000";
      },
      (c) => {
        c.Config.User = "";
      },
      (c) => {
        c.Config.Labels["winesnap.scope"] = "production";
      },
      (c) => {
        c.HostConfig.ReadonlyRootfs = false;
      },
      (c) => {
        c.HostConfig.NetworkMode = "host";
      },
      (c) => {
        c.HostConfig.CapDrop = [];
      },
      (c) => {
        c.HostConfig.SecurityOpt = [];
      },
      (c) => {
        c.HostConfig.PortBindings = { 5432: [] };
      },
      (c) => {
        c.Mounts = [{ Type: "bind" }];
      },
      (c) => {
        c.NetworkSettings.Networks.extra = {};
      },
    ]) {
      const value = container();
      mutate(value);
      expect(() => assertSandbox(value, names)).toThrow();
    }
  });
  it("limits synthetic service tokens to one hour and no user impersonation", () => {
    const token = recoveryToken("a".repeat(64), "service_role");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.role).toBe("service_role");
    expect(payload.exp - payload.iat).toBe(3600);
    expect(() => recoveryToken("a".repeat(64), "authenticated")).toThrow();
  });
  it("never connects to a hosted project or regenerates the destination schema", () => {
    const code = readFileSync(
      new URL("../check-local-platform-recovery.mjs", import.meta.url),
      "utf8",
    );
    expect(code).not.toContain("bootstrap.local.sql");
    expect(code).not.toContain(".supabase.co");
    expect(code).toContain('"--internal"');
    expect(code).toContain('"pg_dump"');
    expect(code).toContain('"pg_restore"');
    expect(code).toContain('"--exit-on-error"');
    expect(code).toContain('"--single-transaction"');
    expect(code).toContain('"--no-role-passwords"');
    expect(code).toContain('process.env.WINESNAP_PLATFORM_PRIVATE_IO, "1"');
    expect(code).toContain("assert.deepEqual(bundle.images, images)");
    expect(code).toContain("reapply-restored-erasures.sql");
    expect(code).toContain("test-image-proxy-policy.sql");
    const wrapper = readFileSync(
      new URL("../rehearse-local-platform-recovery.ps1", import.meta.url),
      "utf8",
    );
    expect(wrapper).toContain("ProtectedData]::Protect");
    expect(wrapper).toContain("ProtectedData]::Unprotect");
    expect(wrapper).toContain("CurrentUser");
    expect(wrapper).toContain("RedirectStandardOutput=$true");
    expect(wrapper).not.toMatch(/& \$docker[^\n]*\bprune\b/);
  });
});
