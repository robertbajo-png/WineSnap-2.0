import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  assertOrdinaryJournalFree,
  openJournalArchive,
  sealJournalArchive,
} from "./owned-dev11-archive.mjs";

it("authenticates a journal-only envelope and checks age even when maintenance did not run", () => {
  const now = Date.parse("2026-11-28T10:00:00Z");
  const installation = randomUUID();
  const key = randomBytes(32);
  const snapshot = {
    version: 1,
    installation,
    capturedAt: new Date(now).toISOString(),
    state: { goal: null, readings: [] },
  };
  const sealed = sealJournalArchive(snapshot, key, installation, now);
  expect(openJournalArchive(sealed, key, installation, now + 7 * 86_400_000 - 1)).toEqual(snapshot);
  expect(() => openJournalArchive(sealed, key, installation, now + 7 * 86_400_000)).toThrow();
  expect(() => openJournalArchive(sealed, key, installation, now - 1)).toThrow();
  expect(() => openJournalArchive(sealed, key, randomUUID(), now)).toThrow();
  sealed[sealed.length - 1] ^= 1;
  expect(() => openJournalArchive(sealed, key, installation, now)).toThrow();
});

it("fails closed on unknown dumps or either DEV-11 schema in the ordinary backup", () => {
  const ordinary =
    ";     Format: CUSTOM\n" +
    "1; 0 1 TABLE DATA auth users supabase_auth_admin\n" +
    "2; 0 2 TABLE DATA winesnap_local migrations postgres\n";
  expect(() => assertOrdinaryJournalFree(ordinary)).not.toThrow();
  expect(() =>
    assertOrdinaryJournalFree(
      ordinary + '3; 0 3 TABLE DATA "winesnap_dev11_data" reading postgres\n',
    ),
  ).toThrow();
  expect(() =>
    assertOrdinaryJournalFree(
      ordinary + "3; 0 3 TABLE DATA winesnap_dev11_control account postgres\n",
    ),
  ).toThrow();
  expect(() => assertOrdinaryJournalFree("verified")).toThrow();
});
