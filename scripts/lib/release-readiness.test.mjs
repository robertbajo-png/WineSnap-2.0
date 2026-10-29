import { mkdtemp, writeFile, rm, mkdir, symlink, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessLocalOperations,
  assessRelease,
  approvalMaxAgeMs,
  readBoundedJson,
  releaseGates,
  testProject,
} from "./release-readiness.mjs";

const now = Date.parse("2026-10-25T12:00:00Z"),
  commit = "a".repeat(40);
const source = { now, commit, clean: true };
function fixture() {
  return {
    version: 1,
    candidateCommit: commit,
    appOrigin: "https://app.release-fixture.se",
    backendProject: "x".repeat(20),
    approvals: Object.fromEntries(
      Object.keys(releaseGates).map((key) => [
        key,
        {
          status: "verified",
          reviewedAt: new Date(now).toISOString(),
          reviewer: "Synthetic reviewer",
          reference: `private:synthetic/${key}`,
        },
      ]),
    ),
  };
}
function localFixture() {
  const base = {
    project: testProject,
    productionTouched: false,
    completed: true,
    fullDatabaseBackup: false,
    checkedAt: new Date(now).toISOString(),
  };
  const backupFile = "snapshot-20261025-120000000.dpapi";
  return {
    maintenance: {
      ...base,
      results: Object.fromEntries(
        ["privacy", "prices"].map((key) => [key, { status: 200, failed: 0, remaining: 0 }]),
      ),
    },
    backup: { ...base, verifiedTables: 35, backupFile },
    restore: { ...base, tables: 35, cleanupCompleted: true, snapshotFile: backupFile },
  };
}

describe("public release acceptance contract", () => {
  it("keeps missing evidence and the shipped pending template blocked", () => {
    expect(assessRelease(null, source).releaseReady).toBe(false);
    const pending = JSON.parse(readFileSync("config/release/acceptance.example.json", "utf8"));
    const report = assessRelease(pending, source);
    expect(report.releaseReady).toBe(false);
    expect(report.gates).toHaveLength(10);
    expect(report.gates.every((gate) => gate.status === "pending")).toBe(true);
  });
  it("accepts a complete synthetic attestation only for the exact clean candidate", () => {
    const report = assessRelease(fixture(), source);
    expect(report.releaseReady).toBe(true);
    expect(report.checksOperatorAttestationsOnly).toBe(true);
    expect(assessRelease(fixture(), { ...source, clean: false }).releaseReady).toBe(false);
    expect(assessRelease(fixture(), { ...source, commit: "b".repeat(40) }).blockers).toContain(
      "candidate_not_bound",
    );
    expect(assessRelease(fixture(), { ...source, commit: null }).releaseReady).toBe(false);
  });
  it.each(Object.keys(releaseGates))("requires a recorded decision for %s", (id) => {
    const value = fixture();
    value.approvals[id] = { status: "pending", reviewedAt: null, reviewer: null, reference: null };
    expect(assessRelease(value, source).blockers).toContain(`${id}:pending`);
    delete value.approvals[id];
    expect(assessRelease(value, source).blockers).toContain("operator_evidence_invalid");
  });
  it.each([-approvalMaxAgeMs - 1, 300001])(
    "rejects stale or future acceptance time: %s",
    (offset) => {
      const value = fixture();
      value.approvals.supabase.reviewedAt = new Date(now + offset).toISOString();
      expect(assessRelease(value, source).blockers).toContain("supabase:stale_or_future");
    },
  );
  it.each([
    "http://app.release-fixture.se",
    "https://127.0.0.1",
    "https://[::1]",
    "https://test.localhost",
    "https://preview.trycloudflare.com",
    "https://example.com",
    "https://app.invalid",
    "https://app.test",
    "https://app.release-fixture.se/path",
    "https://app.release-fixture.se?token=synthetic",
    "https://synthetic:secret@app.release-fixture.se",
    "https://app.release-fixture.se:5210",
  ])("rejects non-release origin syntax without contacting it: %s", (appOrigin) => {
    expect(assessRelease({ ...fixture(), appOrigin }, source).blockers).toContain(
      "release_origin_not_accepted",
    );
  });
  it("never approves the disposable backend or treats privacy build switches as evidence", () => {
    expect(assessRelease({ ...fixture(), backendProject: testProject }, source).releaseReady).toBe(
      false,
    );
    expect(
      assessRelease(
        { VITE_PRIVACY_OPERATIONS_VERIFIED: "true", VITE_PRIVACY_SUPPLIERS_VERIFIED: "true" },
        source,
      ).releaseReady,
    ).toBe(false);
  });
  it("does not disclose reviewer data, references or unknown private fields", () => {
    const value = fixture();
    const report = JSON.stringify(assessRelease(value, source));
    expect(report).not.toContain("Synthetic reviewer");
    expect(report).not.toContain("private:synthetic");
    const invalid = JSON.stringify(
      assessRelease({ ...value, apiKey: "synthetic-private-canary" }, source),
    );
    expect(invalid).not.toContain("synthetic-private-canary");
    expect(invalid).not.toContain("apiKey");
  });
});

describe("local operational hints never imply platform recovery", () => {
  it("requires fresh success and a restore of the exact latest snapshot", () => {
    const input = localFixture();
    const report = assessLocalOperations(input, now);
    expect(report.maintenance).toBe("current");
    expect(report.matchingApplicationRestore).toBe("current");
    expect(report.affectsReleaseApproval).toBe(false);
    expect(report.fullPlatformRecoveryVerified).toBe(false);
    input.restore.snapshotFile = "snapshot-20261024-120000000.dpapi";
    expect(assessLocalOperations(input, now).matchingApplicationRestore).toBe(
      "unverified_or_stale",
    );
  });
  it.each(["maintenance", "backup", "restore"])(
    "does not accept foreign, stale or unsafe %s reports",
    (id) => {
      for (const change of [
        { project: "other-project" },
        { completed: false },
        { productionTouched: true },
        { checkedAt: new Date(now - 27 * 3600000).toISOString() },
        { checkedAt: new Date(now + 600000).toISOString() },
      ]) {
        const input = localFixture();
        Object.assign(input[id], change);
        const report = assessLocalOperations(input, now);
        expect(
          report[
            id === "maintenance"
              ? "maintenance"
              : id === "backup"
                ? "applicationBackup"
                : "matchingApplicationRestore"
          ],
        ).not.toBe("current");
      }
    },
  );
  it("does not accept incomplete jobs, old table coverage, failed cleanup or full-backup claims", () => {
    const input = localFixture();
    input.maintenance.results.privacy.remaining = 1;
    input.backup.verifiedTables = 30;
    input.restore.cleanupCompleted = false;
    const report = assessLocalOperations(input, now);
    expect(Object.values(report)).not.toContain("current");
    input.backup.fullDatabaseBackup = true;
    expect(assessLocalOperations(input, now).applicationBackup).not.toBe("current");
    expect(assessLocalOperations({}, now).matchingApplicationRestore).not.toBe("current");
  });
});

describe("bounded local evidence reader", () => {
  async function withDirectory(run) {
    const folder = await mkdtemp(join(tmpdir(), "winesnap-release-check-"));
    try {
      await run(folder);
    } finally {
      expect(dirname(resolve(folder))).toBe(resolve(tmpdir()));
      expect(basename(folder)).toMatch(/^winesnap-release-check-/);
      await rm(folder, { recursive: true, force: true });
    }
  }
  it("accepts ordinary UTF-8 and PowerShell BOM JSON but no oversized or malformed input", async () => {
    await withDirectory(async (folder) => {
      const path = join(folder, "evidence.json");
      expect((await readBoundedJson(path)).state).toBe("missing");
      await writeFile(path, '\uFEFF{"version":1}');
      expect((await readBoundedJson(path)).value).toEqual({ version: 1 });
      for (const text of [
        "not JSON synthetic-private-canary",
        " ".repeat(65537),
        Buffer.from([0xc3, 0x28]),
      ]) {
        await writeFile(path, text);
        const result = await readBoundedJson(path);
        expect(result).toEqual({ value: null, state: "unreadable_or_invalid" });
        expect(JSON.stringify(result)).not.toContain("synthetic-private-canary");
      }
    });
  });
  it("refuses redirected parent directories instead of following evidence elsewhere", async () => {
    await withDirectory(async (folder) => {
      const real = join(folder, "real"),
        link = join(folder, "link");
      await mkdir(real);
      await writeFile(join(real, "evidence.json"), '{"version":1}');
      await symlink(real, link, process.platform === "win32" ? "junction" : "dir");
      expect(await readBoundedJson(join(link, "evidence.json"))).toEqual({
        value: null,
        state: "unreadable_or_invalid",
      });
    });
  });
  it("returns blocked exit 2 without exposing malformed operator evidence or reading real private status", async () => {
    await withDirectory(async (folder) => {
      const scripts = join(folder, "scripts");
      await mkdir(scripts);
      await copyFile(
        "scripts/check-release-readiness.mjs",
        join(scripts, "check-release-readiness.mjs"),
      );
      await symlink(
        fileURLToPath(new URL("./", import.meta.url)),
        join(scripts, "lib"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await writeFile(
        join(folder, ".winesnap-release-evidence.local.json"),
        "not-json synthetic-private-canary",
      );
      const result = spawnSync(process.execPath, [join(scripts, "check-release-readiness.mjs")], {
        cwd: folder,
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
        env: { ...process.env, LOCALAPPDATA: folder, GIT_CEILING_DIRECTORIES: folder },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout);
      expect(report.releaseReady).toBe(false);
      expect(report.readOnly).toBe(true);
      expect(report.productionTouched).toBe(false);
      expect(report.blockers).toContain("operator_evidence_invalid");
      expect(report.blockers).not.toContain("operator_evidence_missing");
      expect(result.stdout).not.toContain("synthetic-private-canary");
      expect(result.stdout).not.toContain(folder);
    });
  });
});
