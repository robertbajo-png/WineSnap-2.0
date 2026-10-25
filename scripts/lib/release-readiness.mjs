import { isIP } from "node:net";
import { lstat, open } from "node:fs/promises";
import { resolve, dirname, parse } from "node:path";
import { z } from "zod";

export const testProject = "pzniyupmgwvlldvztzqh";
export const approvalMaxAgeMs = 30 * 86400000;
const clockSkewMs = 5 * 60000;
export async function readBoundedJson(path) {
  let file;
  try {
    for (let current = resolve(path); current !== parse(current).root; current = dirname(current)) {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("redirected_path");
    }
    file = await open(path, "r");
    const info = await file.stat();
    if (!info.isFile() || info.size > 65536) throw new Error("invalid_file");
    const bytes = Buffer.alloc(65537);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > 65536 || length < info.size) throw new Error("invalid_file");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    return { value: JSON.parse(text.replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { value: null, state: error.code === "ENOENT" ? "missing" : "unreadable_or_invalid" };
  } finally {
    await file?.close().catch(() => undefined);
  }
}
export const releaseGates = {
  supabase: "Supabase account, agreement, region and retention",
  openai: "OpenAI business project, agreement and data controls",
  gemini: "Gemini project, billing, agreement and logging",
  hosting: "Owned HTTPS origin and all delivery suppliers",
  privacy: "Controller identity, purposes, lawful bases and rights process",
  audience: "Adult audience, child-data authority and DPIA decision",
  recovery: "Full database, Auth, Storage and off-device recovery",
  email: "Verified SMTP delivery and monitored contacts",
  acceptance: "Candidate-bound CI, browser and real-device acceptance",
  rollout: "Explicit release approval and tested rollback",
};
const gateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending"),
      reviewedAt: z.null(),
      reviewer: z.null(),
      reference: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("verified"),
      reviewedAt: z.iso.datetime({ offset: true }),
      reviewer: z.string().trim().min(2).max(120),
      reference: z
        .string()
        .min(5)
        .max(200)
        .regex(/^[a-z][a-z0-9:/._-]+$/i),
    })
    .strict(),
]);
const evidenceSchema = z
  .object({
    version: z.literal(1),
    candidateCommit: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    appOrigin: z.string().max(300).nullable(),
    backendProject: z
      .string()
      .regex(/^[a-z0-9]{20}$/)
      .nullable(),
    approvals: z
      .object(Object.fromEntries(Object.keys(releaseGates).map((key) => [key, gateSchema])))
      .strict(),
  })
  .strict();

function releaseOrigin(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      !url.port &&
      host.includes(".") &&
      !host.includes(":") &&
      !isIP(host) &&
      !/(?:^|\.)(?:localhost|local|internal|invalid|test|example|trycloudflare\.com|example\.(?:com|net|org))$/.test(
        host,
      )
    );
  } catch {
    return false;
  }
}
function fresh(value, now, maxAge) {
  const date = Date.parse(value);
  return Number.isFinite(date) && date <= now + clockSkewMs && now - date <= maxAge;
}

// A structured operator attestation check, not a contract verifier or deployment action.
export function assessRelease(evidence, { commit, clean, now = Date.now() }) {
  const parsed = evidenceSchema.safeParse(evidence);
  const blockers = [];
  if (!/^[a-f0-9]{40}$/.test(commit ?? "") || !clean)
    blockers.push("source_not_clean_or_identified");
  if (!parsed.success)
    blockers.push(evidence == null ? "operator_evidence_missing" : "operator_evidence_invalid");
  const input = parsed.success ? parsed.data : null;
  if (input) {
    if (!input.candidateCommit || input.candidateCommit !== commit)
      blockers.push("candidate_not_bound");
    if (!releaseOrigin(input.appOrigin)) blockers.push("release_origin_not_accepted");
    if (!input.backendProject || input.backendProject === testProject)
      blockers.push("release_backend_not_selected");
  }
  const gates = Object.entries(releaseGates).map(([id, label]) => {
    const approval = input?.approvals[id];
    const accepted =
      approval?.status === "verified" && fresh(approval.reviewedAt, now, approvalMaxAgeMs);
    return {
      id,
      label,
      status: accepted
        ? "recorded"
        : approval?.status === "verified"
          ? "stale_or_future"
          : "pending",
    };
  });
  for (const gate of gates)
    if (gate.status !== "recorded") blockers.push(`${gate.id}:${gate.status}`);
  return {
    releaseReady: blockers.length === 0,
    checksOperatorAttestationsOnly: true,
    candidateCommit: /^[a-f0-9]{40}$/.test(commit ?? "") ? commit : null,
    blockers,
    gates,
  };
}

// These local reports are advisory only: none can satisfy a public-release gate.
export function assessLocalOperations({ maintenance, backup, restore }, now = Date.now()) {
  const recent = (value) =>
    value?.project === testProject &&
    value.productionTouched === false &&
    value.completed === true &&
    fresh(value.checkedAt, now, 26 * 3600000);
  const jobs = ["privacy", "prices"].every((name) => {
    const result = maintenance?.results?.[name];
    return result?.status === 200 && result.failed === 0 && result.remaining === 0;
  });
  const snapshotName = /^snapshot-\d{8}-\d{9}\.dpapi$/;
  const backedUp =
    recent(backup) &&
    backup.fullDatabaseBackup === false &&
    backup.verifiedTables === 35 &&
    snapshotName.test(backup.backupFile ?? "");
  const restored =
    backedUp &&
    recent(restore) &&
    restore.fullDatabaseBackup === false &&
    restore.tables === 35 &&
    restore.cleanupCompleted === true &&
    restore.snapshotFile === backup.backupFile &&
    Date.parse(restore.checkedAt) >= Date.parse(backup.checkedAt);
  return {
    scope: "local_test_application_only",
    affectsReleaseApproval: false,
    maintenance: recent(maintenance) && jobs ? "current" : "unverified_or_unhealthy",
    applicationBackup: backedUp ? "current" : "unverified_or_stale",
    matchingApplicationRestore: restored ? "current" : "unverified_or_stale",
    fullPlatformRecoveryVerified: false,
  };
}
