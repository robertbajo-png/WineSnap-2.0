import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chefRequestSchema, emptyChefContext } from "@/features/chef/domain";

describe("patched schema collection limits", () => {
  it("rejects oversized constrained arrays without accumulating per-element failures", () => {
    const result = z.array(z.string()).max(4).safeParse(Array(4000).fill(123));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
  });
  it("fills the complete validated Chef context when omitted", () => {
    const result = chefRequestSchema.parse({
      action: "chat",
      requestId: crypto.randomUUID(),
      message: "Soppa",
      conversationId: crypto.randomUUID(),
      conversationRevision: 0,
    });
    expect(result.context).toEqual(emptyChefContext);
  });
});
