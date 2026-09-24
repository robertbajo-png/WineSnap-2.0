import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI security contracts", () => {
  it("requires JWT verification for every AI edge function", () => {
    const config = read("supabase/config.toml");
    for (const name of [
      "analyze-wine",
      "restaurant-match",
      "taste-suggestions",
      "wine-suggestions",
    ]) {
      expect(config).toMatch(
        new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*true`, "m"),
      );
    }
  });

  it("applies the shared authentication and quota guard in every AI function", () => {
    for (const name of [
      "analyze-wine",
      "restaurant-match",
      "taste-suggestions",
      "wine-suggestions",
    ]) {
      const source = read(`supabase/functions/${name}/index.ts`);
      expect(source).toContain('from "../_shared/aiSecurity.ts"');
      expect(source).toContain("requireAiAccess(req");
    }
  });
});
