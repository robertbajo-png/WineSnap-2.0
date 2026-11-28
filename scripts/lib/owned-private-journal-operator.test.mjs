import { expect, it, vi } from "vitest";
import { createOwnedJournalOperator } from "./owned-private-journal-operator.mjs";

const backendId = "a".repeat(32);
const journalId = "d191e047-b45c-4e90-b2cd-48469ba9be51";
const attempt = "1152c0b4-50e3-4651-8d31-14c824f59749";

it("does not execute without a pinned installation and a valid attempt", async () => {
  const execute = vi.fn();
  expect(() => createOwnedJournalOperator({ execute, backendId: "", journalId })).toThrow();
  const operator = createOwnedJournalOperator({ execute, backendId, journalId });
  await expect(operator.prune(null)).rejects.toThrow("Private journal operator unavailable");
  await expect(operator.restore(attempt, Buffer.alloc(256 * 1024 + 1))).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

it("maps unreadable replies and executor failures to a content-free error", async () => {
  const execute = vi.fn().mockResolvedValueOnce("not-a-count");
  execute.mockRejectedValueOnce(new Error("synthetic untrusted detail"));
  const operator = createOwnedJournalOperator({ execute, backendId, journalId });
  await expect(operator.prune(attempt)).rejects.toThrow("Private journal operator unavailable");
  await expect(operator.capture(attempt)).rejects.toHaveProperty(
    "message",
    "Private journal operator unavailable",
  );
});

it("requires the exact database acknowledgement, not a truthy string", async () => {
  const execute = vi.fn().mockResolvedValueOnce("true").mockResolvedValueOnce("t");
  const operator = createOwnedJournalOperator({ execute, backendId, journalId });
  expect(await operator.pass(attempt)).toBe(false);
  expect(await operator.pass(attempt)).toBe(true);
});
