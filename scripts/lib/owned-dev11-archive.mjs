import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const day = 86400000;
const limit = 256 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const schemas = ["winesnap_dev11_control", "winesnap_dev11_data"];
export const ordinaryJournalExclusions = Object.freeze(
  schemas.map((name) => "--exclude-schema=" + name),
);

export function assertOrdinaryJournalFree(list) {
  assert.equal(typeof list, "string");
  assert.ok(list.length <= 2 * 1024 * 1024, "Unexpected ordinary dump inventory");
  const entries = list.split(/\r?\n/).filter((line) => /^\d+;\s+\d+\s+\d+\s/.test(line));
  assert.ok(/^;\s+Format:\s+CUSTOM\s*$/m.test(list), "Unrecognized PostgreSQL archive inventory");
  assert.ok(
    entries.some((line) => / TABLE DATA auth users /.test(line)),
    "Missing ordinary Auth data",
  );
  assert.ok(
    entries.some((line) => / TABLE DATA winesnap_local migrations /.test(line)),
    "Missing owned database ledger",
  );
  assert.ok(
    entries.every((line) => !schemas.some((name) => line.toLowerCase().includes(name))),
    "Private journal is not permitted in the ordinary archive",
  );
}

function checkCapture(value, installation, now) {
  if (!uuid.test(installation) || value?.version !== 1 || value.installation !== installation)
    throw new Error("Private archive installation mismatch");
  const time = Date.parse(value.capturedAt);
  if (!Number.isFinite(time) || time <= now - 7 * day || time > now)
    throw new Error("Private archive is outside its recovery window");
}

// The installation key must be protected by the caller, separate from the archive.
export function sealJournalArchive(value, key, installation, now = Date.now()) {
  assert.ok(Buffer.isBuffer(key) && key.length === 32);
  checkCapture(value, installation, now);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  try {
    assert.ok(plain.length > 0 && plain.length <= limit);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("winesnap-dev11-v1:" + installation));
    const data = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  } finally {
    plain.fill(0);
  }
}

export function openJournalArchive(data, key, installation, now = Date.now()) {
  assert.ok(Buffer.isBuffer(key) && key.length === 32 && uuid.test(installation));
  assert.ok(Buffer.isBuffer(data) && data.length > 28 && data.length <= limit + 28);
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from("winesnap-dev11-v1:" + installation));
  decipher.setAuthTag(data.subarray(12, 28));
  let plain;
  let tail;
  try {
    plain = decipher.update(data.subarray(28));
    tail = decipher.final();
    assert.equal(tail.length, 0);
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
    checkCapture(value, installation, now);
    return value;
  } finally {
    plain?.fill(0);
    tail?.fill(0);
  }
}
