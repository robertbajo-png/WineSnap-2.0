import assert from "node:assert/strict";
import { checkOwnedContainer } from "./owned-backend.mjs";
import { ownedResumeOrder } from "./owned-lifecycle.mjs";

// Inspect only the closed set of installed services; never discover or provision resources.
export async function inspectOwnedContainers(json, installationId) {
  assert.match(installationId, /^[a-f0-9]{32}$/);
  const names = ownedResumeOrder.map((service) => `winesnap-owned-${service}`);
  const values = await json(["inspect", ...names]);
  assert.ok(Array.isArray(values));
  assert.equal(values.length, names.length);
  const containers = new Map();
  const ids = new Set();
  for (const value of values) {
    const name = value?.Name?.slice(1);
    assert.ok(names.includes(name) && !containers.has(name));
    checkOwnedContainer(value, name, installationId);
    assert.match(value.Id, /^[a-f0-9]{64}$/);
    assert.ok(!ids.has(value.Id));
    ids.add(value.Id);
    containers.set(name, value);
  }
  return new Map(names.map((name) => [name, containers.get(name)]));
}
