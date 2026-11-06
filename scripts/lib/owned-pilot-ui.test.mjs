import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectOwnedPilotUi } from "./owned-pilot-ui.mjs";

describe("explicit owned pilot UI selection", () => {
  it("defaults to the classic experience and only explicitly opts into dark", () => {
    expect(selectOwnedPilotUi({ action: "Start" })).toEqual({
      label: "classic-v1",
      enabled: false,
    });
    expect(selectOwnedPilotUi({ action: "Update", requested: "Dark" })).toEqual({
      label: "dark-v1",
      enabled: true,
    });
  });
  it.each(["Start", "Resume", "Verify", "RestartApp", "Backup"])(
    "preserves installed selection on %s without accepting an override",
    (action) => {
      expect(selectOwnedPilotUi({ action, installed: "dark-v1" }).enabled).toBe(true);
      expect(() => selectOwnedPilotUi({ action, requested: "Dark" })).toThrow("explicit Update");
    },
  );
  it("supports an explicit classic rollback without modifying the public origin", () => {
    expect(
      selectOwnedPilotUi({ action: "Update", installed: "dark-v1", requested: "Classic" }),
    ).toEqual({ label: "classic-v1", enabled: false });
  });
  it.each(["Light", "true", "", "Dark;other"])("rejects unknown requested mode %s", (requested) => {
    expect(() => selectOwnedPilotUi({ action: "Update", requested })).toThrow();
  });
  it("refuses unknown installed metadata instead of silently replacing it", () => {
    expect(() => selectOwnedPilotUi({ action: "Update", installed: "unrecognized" })).toThrow();
  });
  it("keeps Docker's pilot default off and the shared inspector read-only", () => {
    expect(readFileSync("Dockerfile", "utf8")).toContain("ARG VITE_PILOT_UI_ENABLED=false");
    const source = readFileSync("scripts/run-owned-windows.ps1", "utf8");
    expect(source).toContain("[ValidateSet('Dark','Classic')][string]$PilotUi");
    expect(source).toContain("WINESNAP_OWNED_PILOT_UI");
    expect(source).toContain("elseif($Action -eq 'Update'){120000}");
    expect(readFileSync("scripts/rehearse-owned-recovery.ps1", "utf8")).toContain(
      "Open-OwnedRuntimeLock -Name operation -WaitMs 120000",
    );
  });
});
