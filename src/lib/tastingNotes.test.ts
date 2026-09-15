import { describe, expect, it } from "vitest";
import {
  buildTastingNoteInsert,
  createSaveGuard,
  draftFromStored,
  draftAfterSave,
  EMPTY_TASTING_NOTE,
  normalizeIntensities,
  runGuardedSave,
} from "./tastingNotes";

describe("personal tasting note data", () => {
  it("preserves edits made while a save is pending", () => {
    const submitted = { ...EMPTY_TASTING_NOTE("2026-09-14"), summary: "First note" };
    const current = { ...submitted, summary: "New unsaved words" };
    const empty = EMPTY_TASTING_NOTE("2026-09-15");
    expect(draftAfterSave(current, submitted, empty)).toBe(current);
    expect(draftAfterSave({ ...submitted }, submitted, empty)).toBe(empty);
  });
  it("keeps AI fields out of the personal note payload", () => {
    const draft = EMPTY_TASTING_NOTE("2026-09-14");
    draft.aromas = [{ name: "Violet", active: true, intensity: 4 }];
    const payload = buildTastingNoteInsert(draft, "user-1", "wine-1");
    expect(payload).toMatchObject({ aromas: ["Violet"], aroma_intensities: { Violet: 4 } });
    expect(payload).not.toHaveProperty("primary_notes");
    expect(payload).not.toHaveProperty("ai_raw");
  });

  it("does not invent an intensity for an unknown value", () => {
    const draft = EMPTY_TASTING_NOTE("2026-09-14");
    draft.aromas = [{ name: "Rose", active: true, intensity: null }];
    expect(buildTastingNoteInsert(draft, "u", "w").aroma_intensities).toEqual({});
  });

  it("excludes inactive aromas and invalid intensity values", () => {
    const draft = EMPTY_TASTING_NOTE("2026-09-14");
    draft.aromas = [
      { name: "Cedar", active: false, intensity: 5 },
      { name: "Smoke", active: true, intensity: 7 },
    ];
    expect(buildTastingNoteInsert(draft, "u", "w")).toMatchObject({
      aromas: ["Smoke"],
      aroma_intensities: {},
    });
  });

  it("loads historical values without inventing missing intensities", () => {
    const draft = draftFromStored({
      rating: 4,
      aromas: ["Violet", "Oak"],
      aroma_intensities: { Violet: 2 },
      body: null,
      tannin: 3,
      acidity: null,
      sweetness: 1,
      finish: "Long",
      notes: "Fresh and floral",
      location: "Home",
      tasted_at: "2026-09-01",
    });
    expect(draft.aromas).toEqual([
      { name: "Violet", active: true, intensity: 2 },
      { name: "Oak", active: true, intensity: null },
    ]);
    expect(draft.body).toBeNull();
  });

  it("ignores malformed stored intensity values", () => {
    expect(normalizeIntensities({ Rose: null, Oak: 3, Smoke: 0, Cedar: "4" })).toEqual({ Oak: 3 });
  });
});

it("blocks a duplicate save until the first finishes", () => {
  const guard = createSaveGuard();
  expect(guard.tryStart()).toBe(true);
  expect(guard.tryStart()).toBe(false);
  guard.finish();
  expect(guard.tryStart()).toBe(true);
});

it("releases the save guard after a failed request", async () => {
  const guard = createSaveGuard();
  const failure = await runGuardedSave(guard, async () => {
    throw new Error("offline");
  });
  expect(failure).toMatchObject({ started: true, error: expect.any(Error) });
  const retry = await runGuardedSave(guard, async () => "saved");
  expect(retry).toEqual({ started: true, result: "saved" });
});
