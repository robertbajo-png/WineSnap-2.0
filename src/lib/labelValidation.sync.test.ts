import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The edge function bundler cannot import files outside its own directory, so
 * supabase/functions/analyze-wine/labelValidation.ts is a copy. This test fails
 * the moment the two drift apart.
 */
describe("labelValidation copies", () => {
  it("edge copy is identical to the client source", () => {
    const src = readFileSync("src/lib/labelValidation.ts", "utf8");
    const edge = readFileSync("supabase/functions/analyze-wine/labelValidation.ts", "utf8");
    expect(edge).toBe(src);
  });
});
