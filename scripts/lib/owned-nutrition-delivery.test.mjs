import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pantryMigrationBatch } from "./owned-pantry-preflight.mjs";
import { planningMigration } from "./owned-planning-preflight.mjs";
import {
  nutritionRollbackTag,
  nutritionWebLabel,
  replaceNutritionWeb,
  requireNutritionLedger,
} from "./owned-nutrition-delivery.mjs";

const installation = "a".repeat(32);
const sources = [
  ...Array.from({ length: 37 }, (_, n) => `202610010000${String(n).padStart(2, "0")}_prior.sql`),
  planningMigration,
  ...pantryMigrationBatch,
].map((name) => ({ name, source: `-- synthetic ${name}\nSELECT 1;` }));
const ledger = {
  installation,
  applied: sources.map(({ name, source }) => ({
    name,
    sha256: createHash("sha256").update(source).digest("hex"),
  })),
  tableExists: true,
  saveExists: true,
  stock: true,
  receipt: true,
  saveStock: true,
  confirmUsage: true,
  validateDiners: true,
  enforceDiners: true,
  dinerTrigger: true,
};

const previous = {
  Id: "1".repeat(64),
  Image: `sha256:${"a".repeat(64)}`,
  State: { Running: true },
};
const candidate = `sha256:${"b".repeat(64)}`;

function rehearsal({ failCheck = false, failGuard = false, otherDuringFailure = false } = {}) {
  let current = previous;
  let tagged = previous.Image;
  const calls = [];
  return {
    calls,
    state: () => ({ current, tagged }),
    setCurrent: (value) => (current = value),
    options: {
      previous,
      candidate,
      async guard() {
        calls.push("guard");
        if (failGuard) throw new Error("preflight refused");
      },
      async readWeb() {
        return current;
      },
      async removeWeb(id) {
        expect(current?.Id).toBe(id);
        calls.push(["remove", id]);
        current = null;
      },
      async startWeb(image, label) {
        expect(current).toBeNull();
        calls.push(["start", image, label]);
        current = { Id: (label ? "2" : "3").repeat(64), Image: image, State: { Running: true } };
      },
      async verifyWeb(image, label) {
        expect(current?.Image).toBe(image);
        calls.push(["verify", image, label]);
        if (failCheck && image === candidate) {
          if (otherDuringFailure) current = { ...current, Image: `sha256:${"c".repeat(64)}` };
          throw new Error("candidate failed health check");
        }
      },
      async tagWeb(image) {
        calls.push(["tag", image]);
        tagged = image;
      },
      recovery(ok) {
        calls.push(["recovery", ok]);
      },
    },
  };
}

describe("DEV-08 owned web delivery", () => {
  it("requires the exact prior hashed image and all 40 migration checksums and markers", () => {
    expect(nutritionRollbackTag(previous.Image)).toBe(
      "winesnap-owned:nutrition-rollback-aaaaaaaaaaaa",
    );
    expect(() => nutritionRollbackTag("winesnap-owned:local")).toThrow();
    expect(requireNutritionLedger(sources, ledger, installation)).toEqual({
      applied: 40,
      pending: [],
      scope: "already_applied",
    });
    expect(() => requireNutritionLedger(sources, ledger, "0".repeat(32))).toThrow();
    expect(() =>
      requireNutritionLedger(sources, { ...ledger, dinerTrigger: false }, installation),
    ).toThrow();
    expect(() =>
      requireNutritionLedger([...sources, { name: "extra.sql", source: "" }], ledger, installation),
    ).toThrow();
    expect(() =>
      requireNutritionLedger(
        sources,
        {
          ...ledger,
          applied: [{ ...ledger.applied[0], sha256: "0".repeat(64) }, ...ledger.applied.slice(1)],
        },
        installation,
      ),
    ).toThrow();
  });

  it("refuses a valid legacy ledger with the known pantry migrations still pending", () => {
    expect(() =>
      requireNutritionLedger(
        sources,
        {
          ...ledger,
          applied: ledger.applied.slice(0, 38),
          stock: false,
          receipt: false,
          saveStock: false,
          confirmUsage: false,
          validateDiners: false,
          enforceDiners: false,
          dinerTrigger: false,
        },
        installation,
      ),
    ).toThrow(/does not apply migrations/);
  });

  it("checks the guard and promotes only after the candidate passes", async () => {
    const test = rehearsal();
    await replaceNutritionWeb(test.options);
    expect(test.calls).toEqual([
      "guard",
      ["remove", previous.Id],
      ["start", candidate, nutritionWebLabel],
      ["verify", candidate, nutritionWebLabel],
      ["tag", candidate],
    ]);
    expect(test.state()).toMatchObject({ current: { Image: candidate }, tagged: candidate });
  });

  it("makes no changes if the guard or exact installed identity has changed", async () => {
    const invalid = rehearsal({ failGuard: true });
    await expect(replaceNutritionWeb(invalid.options)).rejects.toThrow("preflight refused");
    expect(invalid.calls).toEqual(["guard"]);
    const stale = rehearsal();
    stale.setCurrent({ ...previous, Id: "0".repeat(64) });
    await expect(replaceNutritionWeb(stale.options)).rejects.toThrow();
    expect(stale.calls).toEqual(["guard"]);
    const unchanged = rehearsal();
    await expect(
      replaceNutritionWeb({ ...unchanged.options, candidate: previous.Image }),
    ).rejects.toThrow();
    expect(unchanged.calls).toEqual([]);
  });

  it("restores the exact previous web image after failed health without claiming an update", async () => {
    const test = rehearsal({ failCheck: true });
    await expect(replaceNutritionWeb(test.options)).rejects.toThrow(
      "candidate failed health check",
    );
    expect(test.calls.slice(4)).toEqual([
      ["recovery", false],
      ["remove", "2".repeat(64)],
      ["start", previous.Image, undefined],
      ["verify", previous.Image, undefined],
      ["tag", previous.Image],
      ["recovery", true],
    ]);
    expect(test.state()).toMatchObject({
      current: { Image: previous.Image },
      tagged: previous.Image,
    });
  });

  it("does not remove an unexpected image while trying to recover", async () => {
    const test = rehearsal({ failCheck: true, otherDuringFailure: true });
    await expect(replaceNutritionWeb(test.options)).rejects.toThrow(/Unexpected web image/);
    expect(test.calls.slice(4)).toEqual([["recovery", false]]);
    expect(test.state().tagged).toBe(previous.Image);
  });

  it("can replace a profile using the same image and still recover the original profile", async () => {
    const test = rehearsal();
    await expect(
      replaceNutritionWeb({
        ...test.options,
        candidate: previous.Image,
        allowSameImage: true,
        async verifyWeb(image, stageLabel) {
          await test.options.verifyWeb(image, stageLabel);
          if (stageLabel) throw new Error("candidate profile failed");
        },
      }),
    ).rejects.toThrow("candidate profile failed");
    expect(test.calls).toContainEqual(["start", previous.Image, nutritionWebLabel]);
    expect(test.calls).toContainEqual(["start", previous.Image, undefined]);
    expect(test.calls.at(-1)).toEqual(["recovery", true]);
  });
});
