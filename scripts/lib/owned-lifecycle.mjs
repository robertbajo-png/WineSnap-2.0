import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const ownedResumeOrder = ["db", "mail", "auth", "rest", "storage", "gateway", "web"];

export function planOwnedMigrations(sources, applied) {
  assert.ok(Array.isArray(sources) && Array.isArray(applied));
  const local = new Map();
  for (const item of sources) {
    assert.match(item.name, /^[A-Za-z0-9_-]+\.sql$/);
    assert.equal(typeof item.source, "string");
    assert.ok(!local.has(item.name), "Duplicate migration source");
    local.set(item.name, {
      ...item,
      sha256: createHash("sha256").update(item.source).digest("hex"),
    });
  }
  const installed = new Set();
  // Validate the complete history before applying any missing migration.
  for (const item of applied) {
    assert.ok(local.has(item.name), "Installed migration is absent from this checkout");
    assert.ok(!installed.has(item.name), "Duplicate installed migration");
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.equal(item.sha256, local.get(item.name).sha256, "Installed migration was changed");
    installed.add(item.name);
  }
  return [...local.values()]
    .filter((item) => !installed.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}
