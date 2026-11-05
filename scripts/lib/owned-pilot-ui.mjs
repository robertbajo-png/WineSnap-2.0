import assert from "node:assert/strict";

export function selectOwnedPilotUi({ requested, installed = "", action }) {
  assert.ok(
    ["", "dark-v1", "classic-v1"].includes(installed),
    "Unexpected installed pilot UI label",
  );
  if (requested !== undefined) {
    assert.equal(action, "Update", "Changing the pilot UI requires an explicit Update");
    assert.ok(["Dark", "Classic"].includes(requested), "Unsupported pilot UI mode");
  }
  const label =
    requested === "Dark"
      ? "dark-v1"
      : requested === "Classic"
        ? "classic-v1"
        : installed || "classic-v1";
  return { label, enabled: label === "dark-v1" };
}
