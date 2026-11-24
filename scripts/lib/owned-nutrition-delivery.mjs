import assert from "node:assert/strict";
import { assessPantryLedger } from "./owned-pantry-preflight.mjs";

export const nutritionWebLabel = "dev08";

export function nutritionRollbackTag(image) {
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  return `winesnap-owned:nutrition-rollback-${image.slice(7, 19)}`;
}

export function requireNutritionLedger(sources, ledger, installation) {
  const result = assessPantryLedger(sources, ledger, installation);
  assert.equal(result.scope, "already_applied", "DEV-08 does not apply migrations");
  return result;
}

export async function replaceNutritionWeb({
  previous,
  candidate,
  guard,
  readWeb,
  removeWeb,
  startWeb,
  verifyWeb,
  tagWeb,
  recovery,
}) {
  assert.match(previous.Id, /^[a-f0-9]{64}$/);
  assert.match(previous.Image, /^sha256:[a-f0-9]{64}$/);
  assert.match(candidate, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(candidate, previous.Image);
  await guard();
  const current = await readWeb();
  assert.equal(current?.Id, previous.Id);
  assert.equal(current.Image, previous.Image);
  assert.ok(current.State.Running);
  try {
    await removeWeb(previous.Id);
    await startWeb(candidate, nutritionWebLabel);
    await verifyWeb(candidate, nutritionWebLabel);
    await tagWeb(candidate);
  } catch (failure) {
    recovery(false);
    const installed = await readWeb();
    if (installed?.Id !== previous.Id) {
      if (installed) {
        assert.equal(installed.Image, candidate, "Unexpected web image; refuse removal");
        assert.match(installed.Id, /^[a-f0-9]{64}$/);
        await removeWeb(installed.Id);
      }
      await startWeb(previous.Image);
    } else if (!installed.State.Running) {
      await startWeb(previous.Image);
    }
    await verifyWeb(previous.Image);
    await tagWeb(previous.Image);
    recovery(true);
    throw failure;
  }
}
